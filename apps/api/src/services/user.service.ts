import { randomUUID } from 'node:crypto';
import type { PrismaClient, User } from '@boilerplate/shared-prisma';
import type { ObjectStorageService } from '@boilerplate/shared-storage';
import { type AVATAR_CONTENT_TYPES, AVATAR_MAX_BYTES, type UpdateProfileRequest, type UserResponse } from '@boilerplate/shared-schemas';
import { AppError, ERROR_CODES } from '@boilerplate/shared-utils';
import type { Logger } from '@boilerplate/shared-logger';

const AVATAR_URL_TTL_SECONDS = 60 * 60;
const EXTENSION_BY_TYPE: Record<(typeof AVATAR_CONTENT_TYPES)[number], string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/** Magic-number sniffing: the declared Content-Type of an upload is client-controlled. */
export function detectImageType(bytes: Uint8Array): (typeof AVATAR_CONTENT_TYPES)[number] | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

export class UserService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: ObjectStorageService,
    private readonly logger: Logger
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async getById(id: bigint): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.deletedAt) throw AppError.notFound('User');
    return user;
  }

  async updateProfile(userId: bigint, patch: UpdateProfileRequest): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.lastName !== undefined ? { lastName: patch.lastName } : {}),
        ...(patch.language !== undefined ? { language: patch.language } : {}),
      },
    });
  }

  /**
   * Stores the avatar under a fresh random key and only then swaps the pointer,
   * so a failed upload never leaves the profile pointing at a missing object.
   */
  async setAvatar(userId: bigint, file: File): Promise<User> {
    if (file.size > AVATAR_MAX_BYTES) throw new AppError(ERROR_CODES.PAYLOAD_TOO_LARGE);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const contentType = detectImageType(bytes);
    if (!contentType) throw new AppError(ERROR_CODES.UNSUPPORTED_MEDIA_TYPE);

    const key = `avatars/${userId}/${randomUUID()}.${EXTENSION_BY_TYPE[contentType]}`;
    try {
      await this.storage.upload(key, Buffer.from(bytes), { contentType, cacheControl: 'private, max-age=31536000, immutable' });
    } catch (error) {
      throw new AppError(ERROR_CODES.STORAGE_ERROR, { cause: error });
    }

    const previous = await this.prisma.user.findUnique({ where: { id: userId }, select: { avatarKey: true } });
    const user = await this.prisma.user.update({ where: { id: userId }, data: { avatarKey: key } });
    if (previous?.avatarKey) this.deleteObjectQuietly(previous.avatarKey);
    return user;
  }

  async removeAvatar(userId: bigint): Promise<User> {
    const previous = await this.prisma.user.findUnique({ where: { id: userId }, select: { avatarKey: true } });
    const user = await this.prisma.user.update({ where: { id: userId }, data: { avatarKey: null } });
    if (previous?.avatarKey) this.deleteObjectQuietly(previous.avatarKey);
    return user;
  }

  /** Avatars live in a private bucket; the client gets a short-lived signed URL. */
  async toResponse(user: User): Promise<UserResponse> {
    let avatarUrl: string | null = null;
    if (user.avatarKey) {
      try {
        avatarUrl = await this.storage.getPresignedUrl(user.avatarKey, { expiresIn: AVATAR_URL_TTL_SECONDS });
      } catch (error) {
        this.logger.warn('Could not sign avatar URL', { error: error instanceof Error ? error.message : String(error) });
      }
    }
    return {
      id: user.id.toString(),
      name: user.name,
      lastName: user.lastName,
      email: user.email,
      status: user.status,
      emailVerified: user.emailVerifiedAt !== null,
      hasPassword: user.password !== null,
      language: user.language,
      avatarUrl,
      createdAt: user.createdAt.toISOString(),
    };
  }

  private deleteObjectQuietly(key: string): void {
    this.storage
      .delete(key)
      .catch(error => this.logger.warn('Old avatar cleanup failed', { key, error: error instanceof Error ? error.message : String(error) }));
  }
}
