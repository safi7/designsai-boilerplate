# Developer entry points. `make help` lists everything.
SHELL := /bin/bash
.DEFAULT_GOAL := help

YARN      := corepack yarn
COMPOSE   := docker compose
INFRA     := mysql postgres valkey minio mailpit
# Host-side tools (Prisma CLI, seed and credit scripts) do not read the root
# .env on their own, so export it into the recipe's shell first. Sourcing with
# bash (rather than `include .env`) keeps quoted values like APP_NAME intact.
WITH_ENV  := set -a; [ -f .env ] && . ./.env; set +a;

##@ Full stack (Docker)

up: ## Build and start the whole stack (web :3000, api :8000, mailpit :8025)
	$(COMPOSE) up -d --build
	@echo "→ http://localhost:3000   (emails: http://localhost:8025, API docs: http://localhost:8000/doc)"

down: ## Stop the stack (keeps data volumes)
	$(COMPOSE) down

reset: ## Stop the stack and DELETE all local data volumes
	$(COMPOSE) down -v --remove-orphans

restart: ## Restart services without rebuilding (or: make restart s=api)
	$(COMPOSE) restart $(s)

rebuild: ## Rebuild images from current code and restart (or: make rebuild s=api)
	$(COMPOSE) up -d --build $(s)

migrate: ## Apply pending migrations + seed inside Docker
	$(COMPOSE) run --rm --build migrate

shell: ## Open a shell in a running service (make shell s=api)
	$(COMPOSE) exec $(s) sh

logs: ## Tail logs of all services (or: make logs s=api)
	$(COMPOSE) logs -f --tail=100 $(s)

ps: ## Service status
	$(COMPOSE) ps

##@ Local development (apps on the host, infra in Docker)

infra: ## Start only the data services
	$(COMPOSE) up -d --wait $(INFRA)

install: ## Install dependencies
	$(YARN) install

setup: ## First-time setup: .env, deps, infra, shared packages, migrations, seed
	@test -f .env || cp .env.example .env
	$(MAKE) install infra
	$(YARN) build:packages
	$(MAKE) db-migrate db-seed

dev: ## Run api, agents and web with hot reload
	$(YARN) turbo run dev --filter=@boilerplate/api --filter=@boilerplate/agents --filter=@boilerplate/web --filter='./packages/*'

##@ Database

db-migrate: ## Apply migrations
	$(WITH_ENV) $(YARN) db:migrate

db-migrate-new: ## Create a migration from schema changes (make db-migrate-new name=add_x)
	$(WITH_ENV) $(YARN) workspace @boilerplate/shared-prisma prisma migrate dev --name $(name)

db-seed: ## Seed reference data (idempotent)
	$(WITH_ENV) $(YARN) db:seed

db-studio: ## Open Prisma Studio
	$(WITH_ENV) $(YARN) db:studio

credits: ## Grant credits to a user (make credits EMAIL=jane@example.com AMOUNT=100)
	@if [ -n "$$($(COMPOSE) ps -q api 2>/dev/null)" ]; then \
		$(COMPOSE) run --rm migrate yarn workspace @boilerplate/api credits:grant --email "$(EMAIL)" --amount "$(AMOUNT)"; \
	else \
		$(WITH_ENV) $(YARN) workspace @boilerplate/api credits:grant --email "$(EMAIL)" --amount "$(AMOUNT)"; \
	fi

##@ Quality gates

lint: ## Lint every workspace
	$(YARN) lint

type-check: ## Type-check every workspace
	$(YARN) type-check

test: ## Unit tests for every workspace
	$(YARN) test

test-integration: ## Ledger integration tests against a real MySQL (needs `make infra`)
	$(COMPOSE) exec -T mysql mysql -uroot -p$${MYSQL_ROOT_PASSWORD:-rootpassword} -e "CREATE DATABASE IF NOT EXISTS boilerplate_test" 2>/dev/null
	DATABASE_URL=mysql://root:rootpassword@localhost:3306/boilerplate_test $(YARN) workspace @boilerplate/shared-prisma prisma migrate deploy
	TEST_DATABASE_URL=mysql://root:rootpassword@localhost:3306/boilerplate_test $(YARN) workspace @boilerplate/api test

e2e: ## Black-box smoke test against the running stack (make up first)
	./scripts/e2e-smoke.sh

build: ## Production build of every workspace
	$(YARN) build

check: lint type-check test build ## Lint, type-check, unit tests and build (CI also runs format:check)

format: ## Format with Prettier
	$(YARN) format

openapi: ## Export the OpenAPI document to apps/api/openapi.json
	$(YARN) workspace @boilerplate/api openapi:export

help:
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage: make \033[36m<target>\033[0m\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

.PHONY: up down reset restart rebuild migrate shell logs ps infra install setup dev db-migrate db-migrate-new db-seed db-studio credits lint type-check test test-integration e2e build check format openapi help
