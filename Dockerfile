FROM tbj7-xtiao-tcr1.tencentcloudcr.com/xtiao-release/node:v22.13.0-pnpm as builder
WORKDIR /app

# 安装 pnpm
RUN npm config set registry https://registry.npmmirror.com && npm install -g pnpm@10 --force

ARG VITE_ENTERPRISE_MODULES_ENTRY=
ARG VITE_ENTERPRISE_HTML_HEAD_PATH=
ARG VITE_ENTERPRISE_FS_ALLOW=

# 复制全量源码并安装依赖
COPY . .
RUN git config --global url."https://github.com/".insteadOf "git+ssh://git@github.com/" && \
    git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"
RUN pnpm install --frozen-lockfile --ignore-scripts --registry=https://registry.npmmirror.com
RUN if [ -n "$VITE_ENTERPRISE_MODULES_ENTRY" ] && [ -d .enterprise ]; then \
      node scripts/install-enterprise-host-deps.mjs .enterprise/octo-enterprise-modules/package.json; \
    fi

# 构建
ARG APP_VERSION=unknown
ENV VITE_APP_VERSION=${APP_VERSION}
ARG ENABLE_ENTERPRISE_SSO=false
ENV VITE_ENABLE_ENTERPRISE_SSO=${ENABLE_ENTERPRISE_SSO}
ENV VITE_ENTERPRISE_MODULES_ENTRY=${VITE_ENTERPRISE_MODULES_ENTRY}
ENV VITE_ENTERPRISE_HTML_HEAD_PATH=${VITE_ENTERPRISE_HTML_HEAD_PATH}
ENV VITE_ENTERPRISE_FS_ALLOW=${VITE_ENTERPRISE_FS_ALLOW}
RUN pnpm --filter @octo/web build

# 生成 version.json
RUN echo "{\"version\":\"${APP_VERSION}\"}" > /app/apps/web/build/version.json

FROM tbj7-xtiao-tcr1.tencentcloudcr.com/xtiao-release/nginx:alpine
COPY --from=builder /app/docker-entrypoint.sh /docker-entrypoint2.sh
RUN sed -i 's/\r$//' /docker-entrypoint2.sh
COPY --from=builder /app/nginx.conf.template /
COPY --from=builder /app/apps/web/build /usr/share/nginx/html
ENTRYPOINT ["sh", "/docker-entrypoint2.sh"]
CMD ["nginx","-g","daemon off;"]
