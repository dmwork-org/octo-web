import React, { Component } from "react";
import { Button, Spin, Toast } from '@douyinfe/semi-ui';
import './login.css'
import QRCode from 'qrcode.react';
import { WKApp, Provider } from "@octo/base"
import { LoginStatus, LoginType, LoginVM } from "./login_vm";
import classNames from "classnames";
import { PasswordStrengthIndicator } from "./PasswordStrengthIndicator";
import { validatePassword } from "./passwordStrength";


// Known safe error messages from the server that can be shown to users
const KNOWN_ERROR_MESSAGES: Record<string, string> = {
    "用户名或密码错误": "用户名或密码错误",
    "验证码错误": "验证码错误",
    "验证码已过期": "验证码已过期",
    "该邮箱已注册": "该邮箱已注册",
    "该用户名已存在": "该用户名已存在",
    "账号已被禁用": "账号已被禁用",
    "发送过于频繁": "发送过于频繁，请稍后再试",
};

/**
 * Sanitize server error messages to prevent information leakage.
 * Only known safe messages are shown; unknown errors get a generic message.
 */
function sanitizeErrorMessage(msg: string): string {
    if (!msg || typeof msg !== "string") return "操作失败，请稍后重试";
    const known = KNOWN_ERROR_MESSAGES[msg];
    if (known) return known;
    // Check if message looks safe (short, no HTML, no stack trace)
    if (msg.length <= 50 && !/[<>{}]|Error:|at /.test(msg)) {
        return msg;
    }
    console.warn("Suppressed raw server error:", msg);
    return "操作失败，请稍后重试";
}

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

type LoginState = {
    loginStatus: string
    loginUUID: string
    getLoginUUIDLoading: boolean
    scanner?: string  // 扫描者的uid
    qrcode?: string
}

class Login extends Component<any, LoginState> {




    render() {

        return <Provider create={() => {
            return new LoginVM()
        }} render={(vm: LoginVM) => {
            return <div className="wk-login">
                <div className="wk-login-content">
                    {vm.inviteInfo && (
                        <div style={{
                            background: '#f0edff',
                            borderRadius: '8px',
                            padding: '12px 16px',
                            marginBottom: '16px',
                            textAlign: 'center',
                            color: '#5b6abf',
                            fontSize: '14px',
                            lineHeight: '1.6',
                        }}>
                            <div>你被邀请加入 <strong>{vm.inviteInfo.space_name}</strong></div>
                            <div>{vm.inviteInfo.max_users > 0 ? `${vm.inviteInfo.member_count}/${vm.inviteInfo.max_users} 人` : `${vm.inviteInfo.member_count} 位成员`}</div>
                        </div>
                    )}
                    <div className="wk-login-content-phonelogin" style={{ "display": vm.loginType === LoginType.phone ? "block" : "none" }}>
                        <div className="wk-login-content-logo">
                            <img src={`${process.env.PUBLIC_URL}/logo.png`} alt="logo" />
                        </div>
                        <div className="wk-login-content-slogan">
                            AI Agent 时代的即时通讯
                        </div>
                        <div className="wk-login-content-form">
                            <input type="text" name="username" autoComplete="username" placeholder="邮箱 / 用户名" onChange={(v) => {
                                vm.username = v.target.value
                            }}></input>
                            <input type="password" name="password" autoComplete="current-password" placeholder="密码" onChange={(v) => {
                                vm.password = v.target.value
                            }}></input>
                            <div className="wk-login-content-form-buttons">
                                <Button loading={vm.loginLoading} className="wk-login-content-form-ok" type='primary' theme='solid' onClick={async () => {
                                    if (!vm.username) {
                                        Toast.error("邮箱或用户名不能为空！")
                                        return
                                    }
                                    if (!vm.password) {
                                        Toast.error("密码不能为空！")
                                        return
                                    }
                                    const isEmail = isValidEmail(vm.username)
                                    if (isEmail) {
                                        vm.requestEmailLogin(vm.username, vm.password).catch((err) => {
                                            Toast.error(sanitizeErrorMessage(err.msg))
                                        })
                                    } else {
                                        vm.requestLoginWithUsernameAndPwd(vm.username, vm.password).catch((err) => {
                                            Toast.error(sanitizeErrorMessage(err.msg))
                                        })
                                    }
                                }}>登录</Button>
                            </div>
                            <div className="wk-login-content-form-others">
                                <div className="wk-login-content-form-scanlogin" onClick={() => {
                                    vm.loginType = LoginType.qrcode
                                }}>
                                    扫描登录
                                </div>
                                <div className="wk-login-content-form-switch" onClick={() => {
                                    vm.loginType = LoginType.register
                                }}>
                                    没有账号？注册
                                </div>
                                <div className="wk-login-content-form-switch" onClick={() => {
                                    vm.loginType = LoginType.forgetPassword
                                }}>
                                    忘记密码
                                </div>
                            </div>
                            <div className="wk-login-content-download">
                                <a href="/download/dmwork.apk" className="wk-login-download-btn">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{marginRight: '6px', verticalAlign: 'middle'}}>
                                        <path d="M17.523 2.234l-3.473 6.012h3.451l-6.973 12.164 2.548-8.164h-3.548l3.473-6.012h-3.451l6.973-12.164zm-2.523 10.766h2.658l-1.418 4.552 3.895-6.786h-2.635l2.418-4.186-3.895 6.786z"/>
                                    </svg>
                                    下载 Android 客户端
                                </a>
                            </div>
                        </div>
                    </div>
                    <div className="wk-login-content-phonelogin" style={{ "display": vm.loginType === LoginType.register ? "block" : "none" }}>
                        <div className="wk-login-content-logo">
                            <img src={`${process.env.PUBLIC_URL}/logo.png`} alt="logo" />
                        </div>
                        <div className="wk-login-content-slogan">
                            注册新账号
                        </div>
                        <div className="wk-login-content-form">
                            <input type="email" name="reg-email" autoComplete="email" placeholder="邮箱" onChange={(v) => {
                                vm.registerEmail = v.target.value
                            }}></input>
                            <input type="text" name="reg-name" autoComplete="name" placeholder="昵称" onChange={(v) => {
                                vm.registerEmailName = v.target.value
                            }}></input>
                            <input type="password" name="reg-password" autoComplete="off" placeholder="密码" onChange={(v) => {
                                vm.registerEmailPassword = v.target.value
                                vm.notifyListener()
                            }}></input>
                            <PasswordStrengthIndicator password={vm.registerEmailPassword || ''} />
                            <input type="password" name="reg-confirm-password" autoComplete="off" placeholder="确认密码" onChange={(v) => {
                                vm.registerEmailConfirmPassword = v.target.value
                            }}></input>
                            <div className="wk-login-content-form-buttons">
                                <Button loading={vm.registerLoading} className="wk-login-content-form-ok" type='primary' theme='solid' onClick={async () => {
                                    if (!vm.registerEmail || !isValidEmail(vm.registerEmail)) {
                                        Toast.error("请输入正确的邮箱地址！")
                                        return
                                    }
                                    if (!vm.registerEmailName) {
                                        Toast.error("昵称不能为空！")
                                        return
                                    }
                                    const passwordError = validatePassword(vm.registerEmailPassword || '');
                                    if (passwordError) {
                                        Toast.error(passwordError)
                                        return
                                    }
                                    if (vm.registerEmailPassword !== vm.registerEmailConfirmPassword) {
                                        Toast.error("两次密码输入不一致！")
                                        return
                                    }
                                    vm.requestEmailRegister(vm.registerEmail, vm.registerEmailPassword, vm.registerEmailName).catch((err) => {
                                        Toast.error(sanitizeErrorMessage(err.msg))
                                    })
                                }}>注册</Button>
                            </div>
                            <div className="wk-login-content-form-others">
                                <div className="wk-login-content-form-switch" onClick={() => {
                                    vm.loginType = LoginType.phone
                                }}>
                                    已有账号？登录
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="wk-login-content-phonelogin" style={{ "display": vm.loginType === LoginType.forgetPassword ? "block" : "none" }}>
                        <div className="wk-login-content-logo">
                            <img src={`${process.env.PUBLIC_URL}/logo.png`} alt="logo" />
                        </div>
                        <div className="wk-login-content-slogan">
                            重置密码
                        </div>
                        <div className="wk-login-content-form">
                            <input type="email" name="forget-email" autoComplete="email" placeholder="注册邮箱" onChange={(v) => {
                                vm.forgetEmail = v.target.value
                            }}></input>
                            <div className="wk-login-content-form-code-row">
                                <input type="text" name="forget-code" autoComplete="one-time-code" placeholder="验证码" onChange={(v) => {
                                    vm.forgetCode = v.target.value
                                }}></input>
                                <Button className="wk-login-content-form-code-btn" disabled={vm.emailCodeCountdown > 0 || vm.emailCodeSending} loading={vm.emailCodeSending} onClick={() => {
                                    if (!vm.forgetEmail || !isValidEmail(vm.forgetEmail)) {
                                        Toast.error("请输入正确的邮箱地址！")
                                        return
                                    }
                                    vm.requestEmailSendCode(vm.forgetEmail, 2).catch((err) => {
                                        Toast.error(sanitizeErrorMessage(err.msg))
                                    })
                                }}>{vm.emailCodeCountdown > 0 ? `${vm.emailCodeCountdown}s` : '发送验证码'}</Button>
                            </div>
                            <input type="password" name="forget-new-pwd" autoComplete="off" placeholder="新密码" onChange={(v) => {
                                vm.forgetNewPassword = v.target.value
                                vm.notifyListener()
                            }}></input>
                            <PasswordStrengthIndicator password={vm.forgetNewPassword || ''} />
                            <input type="password" name="forget-confirm-pwd" autoComplete="off" placeholder="确认新密码" onChange={(v) => {
                                vm.forgetConfirmPassword = v.target.value
                            }}></input>
                            <div className="wk-login-content-form-buttons">
                                <Button loading={vm.forgetLoading} className="wk-login-content-form-ok" type='primary' theme='solid' onClick={async () => {
                                    if (!vm.forgetEmail || !isValidEmail(vm.forgetEmail)) {
                                        Toast.error("请输入正确的邮箱地址！")
                                        return
                                    }
                                    if (!vm.forgetCode) {
                                        Toast.error("验证码不能为空！")
                                        return
                                    }
                                    const newPasswordError = validatePassword(vm.forgetNewPassword || '');
                                    if (newPasswordError) {
                                        Toast.error(newPasswordError)
                                        return
                                    }
                                    if (vm.forgetNewPassword !== vm.forgetConfirmPassword) {
                                        Toast.error("两次密码输入不一致！")
                                        return
                                    }
                                    vm.requestForgetPassword(vm.forgetEmail, vm.forgetCode, vm.forgetNewPassword).then(() => {
                                        Toast.success("密码重置成功，请登录")
                                        vm.loginType = LoginType.phone
                                    }).catch((err) => {
                                        Toast.error(sanitizeErrorMessage(err.msg))
                                    })
                                }}>重置密码</Button>
                            </div>
                            <div className="wk-login-content-form-others">
                                <div className="wk-login-content-form-switch" onClick={() => {
                                    vm.loginType = LoginType.phone
                                }}>
                                    返回登录
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className={classNames("wk-login-content-scanlogin", vm.loginType === LoginType.qrcode ? "wk-login-content-scanlogin-show" : undefined)}>
                        <Spin size="large" spinning={vm.qrcodeLoading}>
                            <div className="wk-login-content-scanlogin-qrcode">
                                {
                                    vm.qrcodeLoading || !vm.qrcode ? undefined : <QRCode value={vm.qrcode} size={280} fgColor={WKApp.config.themeColor}></QRCode>
                                }
                                {
                                    <div className={classNames("wk-login-content-scanlogin-qrcode-avatar", vm.showAvatar() ? "wk-login-content-scanlogin-qrcode-avatar-show" : undefined)}>
                                        {vm.showAvatar() ? <img src={WKApp.shared.avatarUser(vm.uid!)}></img> : undefined}
                                    </div>
                                }
                                {
                                    !vm.autoRefresh ? <div className="wk-login-content-scanlogin-qrcode-expire">
                                        <p>二维码已失效，点击刷新</p>
                                        <img onClick={() => {
                                            vm.reStartAdvance()
                                        }} src={require("./assets/refresh.png")}></img>
                                    </div> : undefined
                                }
                            </div>
                        </Spin>
                        <div className="wk-login-content-scanlogin-qrcode-title">
                            <h3>使用手机{WKApp.config.appName}扫码登录</h3>
                        </div>
                        <div className="wk-login-content-scanlogin-qrcode-desc">
                            <ul>
                                <li>
                                    在手机上打开{WKApp.config.appName}
                                </li>
                                <li>
                                    进入 <b>消息</b> &nbsp; &gt; &nbsp; <b>+</b>  &nbsp; &gt; &nbsp;<b>扫一扫</b>
                                </li>
                                <li>
                                    将你的手机摄像头对准上面二维码进行扫描
                                </li>
                                <li>
                                    在手机上确认登录
                                </li>
                            </ul>
                        </div>
                        <div className="wk-login-footer-buttons">
                            <button onClick={() => {
                                vm.loginType = LoginType.phone
                            }}>使用账号登录</button>
                        </div>

                    </div>
                </div>


            </div>
        }}>

        </Provider>
    }
}

export default Login