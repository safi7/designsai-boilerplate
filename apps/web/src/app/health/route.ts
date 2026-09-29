/** Container liveness probe for the web tier. */
export function GET() {
  return Response.json({ status: 'ok' });
}

export const dynamic = 'force-dynamic';
