# Docker image name
IMAGE_NAME=phirepass-ui
CONTAINER_NAME=phirepass-ui
PORT=8084

# Load environment variables if .env.local exists
ifneq (,$(wildcard .env.local))
    include .env.local
    export
endif

# Local development commands
dev:
	bun run dev

run:
	bun run dev

start-prod:
	node .next/standalone/server.js

# Build the Docker image
docker-build:
	docker build -t $(IMAGE_NAME) \
		--progress=plain \
		.

# Same image, but on the distroless :debug base so `make shell` works
docker-build-debug:
	docker build -t $(IMAGE_NAME) \
		--build-arg RUNNER_IMAGE=gcr.io/distroless/nodejs22-debian12:debug-nonroot \
		--progress=plain \
		.

# Run the container
docker-run:
	docker run -it --rm --name $(CONTAINER_NAME) \
		--env-file .env.local \
		-p $(PORT):8084 $(IMAGE_NAME)

docker-push:
	docker buildx build \
		-t dimitrmok/phirepass-ui:latest \
		--platform linux/amd64,linux/arm64 \
		-f Dockerfile \
		--progress=plain \
		--push \
		.

# Stop the container
stop:
	docker stop $(CONTAINER_NAME) || true
	docker rm $(CONTAINER_NAME) || true

# Build and run
up: build stop docker-run

# View logs
logs:
	docker logs -f $(CONTAINER_NAME)

# Shell into container (requires `make docker-build-debug` — the release image has no shell)
shell:
	docker exec -it $(CONTAINER_NAME) /busybox/sh

# Clean up
clean: stop
	docker rmi $(IMAGE_NAME) || true

# Code formatting
format:
	npx eclint fix 'src/**/*'

.PHONY: dev run start-prod format build docker-build docker-build-debug docker-run stop up logs shell clean
