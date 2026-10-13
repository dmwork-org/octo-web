import { WKApp } from '@octo/base';

/** A socket spans Spaces, but never account/session/API-origin replacement. */
export function captureCommunicationConnectionContext(): () => boolean {
  const login = WKApp.loginInfo;
  const config = WKApp.apiClient.config;
  const uid = login.uid;
  const token = login.token;
  const sessionRevision = login.sessionRevision;
  const originRevision = config.originRevision;
  const apiURL = config.apiURL;
  return () => WKApp.loginInfo === login && WKApp.apiClient.config === config &&
    login.uid === uid && login.token === token && login.sessionRevision === sessionRevision &&
    config.apiURL === apiURL && config.originRevision === originRevision;
}
