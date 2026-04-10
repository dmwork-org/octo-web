import React from 'react';
import { createRoot } from 'react-dom/client';
import '@octo/base/src/theme/tokens.css';
import './style.css';
import { BaseModule, WKApp } from '@octo/base';
import { LoginModule } from '@octo/login';
import { DataSourceModule } from '@octo/datasource';
import { ContactsModule } from '@octo/contacts';
import App from '@web/App';

// 标记扩展环境（Layout 等组件据此跳过 window.location.href 硬跳转）
(window as any).__POWERED_EXTENSION__ = true;

// API 配置（扩展环境直接用完整 URL）
const apiURL = import.meta.env.VITE_API_URL || 'https://api.example.com/v1/';
WKApp.apiClient.config.apiURL = apiURL;
WKApp.apiClient.config.tokenCallback = () => WKApp.loginInfo.token;
WKApp.config.appVersion = '0.0.0.1';
WKApp.config.appName = 'Octo';

WKApp.loginInfo.load();

// 注册模块
WKApp.shared.registerModule(new BaseModule());
WKApp.shared.registerModule(new DataSourceModule());
WKApp.shared.registerModule(new LoginModule());
WKApp.shared.registerModule(new ContactsModule());

WKApp.shared.startup();

// 渲染
const container = document.getElementById('root')!;
const root = createRoot(container);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
