# e2e runner: the official Playwright image (same version as @playwright/test) plus ffmpeg for
# the generated video fixtures and corepack for the pinned pnpm. Screenshot baselines are made
# only here (and in CI), never on a developer's OS.
ARG PLAYWRIGHT_VERSION
FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/* \
  # The image ships a yarn binary; corepack replaces it with its shim.
  && npm install -g --force corepack@0.36.0

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
