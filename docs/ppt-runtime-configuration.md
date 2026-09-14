# PPT entry configuration

The Web container reads `VITE_DOCS_PPT_ENTRY` at startup and writes a boolean
to the existing `/runtime-config.js`, which loads before the application.
Only the exact value `true` enables PPT; unset, empty and other values disable it.

```yaml
env:
  - name: VITE_DOCS_PPT_ENTRY
    value: "true"
```

Update the Web Deployment pod template (or its persistent deployment source),
wait for the rollout to finish, and reload the browser. Setting the value to
`"false"` hides the entry again with the same image. When the value comes from
a ConfigMap, restart the Web pods after changing the ConfigMap.

The initial rollout must contain both this startup script and the matching
Docs module runtime reader. After that rollout, toggling the flag requires
no image rebuild. Runtime values override the build-time value, including
an explicit runtime `false` over a bundle built with `true`. Local development
and static/desktop builds without runtime configuration keep the build-time
fallback, whose default is `false`.

The Nginx template sends `Cache-Control: no-store` for `/runtime-config.js`.
Deployments mounting a custom Nginx ConfigMap must apply the same cache rule;
they override the template shipped in the image. Keep the configuration script
before the application script and exclude it from any proxy/CDN caching.

This frontend switch is not an authorization boundary. Backend document
permissions and the separate Server PPT comment Bot switch still apply.
