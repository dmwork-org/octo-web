import axios from "axios";
import React, { Component } from "react";
import { Button, Spin, Toast } from '@douyinfe/semi-ui';
import './login.css'
import QRCode from 'qrcode.react';
import { WKApp, Provider } from "@octo/base"
import { LoginStatus, LoginType, LoginVM } from "./login_vm";
import classNames from "classnames";

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
                    <div className="wk-login-content-phonelogin" style={{ "display": vm.loginType === LoginType.phone ? "block" : "none" }}>
                        <div className="wk-login-content-logo">
                            <img src={`${process.env.PUBLIC_URL}/logo.png`} alt="logo" />
                        </div>
                        <div className="wk-login-content-slogan">
                            AI Agent 时代的即时通讯
                        </div>
                        <div className="wk-login-content-form">
                            <input type="text" placeholder="手机号或用户名" onChange={(v) => {
                                vm.username = v.target.value
                            }}></input>
                            <input type="password" placeholder="密码" onChange={(v) => {
                                vm.password = v.target.value
                            }}></input>
                            <div className="wk-login-content-form-buttons">
                                <Button loading={vm.loginLoading} className="wk-login-content-form-ok" type='primary' theme='solid' onClick={async () => {
                                    if (!vm.username) {
                                        Toast.error("手机号或用户名不能为空！")
                                        return
                                    }
                                    if (!vm.password) {
                                        Toast.error("密码不能为空！")
                                        return
                                    }
                                    let loginName = vm.username
                                    const isPhoneNumber = /^\+?\d+$/.test(vm.username)
                                    if (isPhoneNumber) {
                                        if (vm.username.length == 11 && vm.username.substring(0,1) === "1") {
                                            loginName = `0086${vm.username}`
                                        }else {
                                            if(vm.username.startsWith("+") ) {
                                                loginName = `00${vm.username.substring(1)}`
                                            }else if(!vm.username.startsWith("00")) {
                                                loginName = `00${vm.username}`
                                            }
                                        }
                                    }
                                    vm.requestLoginWithUsernameAndPwd(loginName, vm.password).catch((err) => {
                                        Toast.error(err.msg)
                                    })
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
                            <input type="text" placeholder="用户名（8-22位英文或数字）" onChange={(v) => {
                                vm.registerUsername = v.target.value
                            }}></input>
                            <input type="text" placeholder="昵称" onChange={(v) => {
                                vm.registerName = v.target.value
                            }}></input>
                            <input type="password" placeholder="密码" onChange={(v) => {
                                vm.registerPassword = v.target.value
                            }}></input>
                            <input type="password" placeholder="确认密码" onChange={(v) => {
                                vm.registerConfirmPassword = v.target.value
                            }}></input>
                            <div className="wk-login-content-form-buttons">
                                <Button loading={vm.registerLoading} className="wk-login-content-form-ok" type='primary' theme='solid' onClick={async () => {
                                    if (!vm.registerUsername) {
                                        Toast.error("用户名不能为空！")
                                        return
                                    }
                                    if (!/^[a-zA-Z0-9]{8,22}$/.test(vm.registerUsername)) {
                                        Toast.error("用户名必须为8-22位英文或数字！")
                                        return
                                    }
                                    if (!vm.registerName) {
                                        Toast.error("昵称不能为空！")
                                        return
                                    }
                                    if (!vm.registerPassword) {
                                        Toast.error("密码不能为空！")
                                        return
                                    }
                                    if (vm.registerPassword !== vm.registerConfirmPassword) {
                                        Toast.error("两次密码输入不一致！")
                                        return
                                    }
                                    vm.requestRegister(vm.registerUsername, vm.registerName, vm.registerPassword).catch((err) => {
                                        Toast.error(err.msg)
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
                            }}>使用手机号登录</button>
                        </div>

                    </div>

                    {/* <div className="wk-login-footer">
                        <ul>
                            <li>注册DMWork</li>
                            <li>忘记密码</li>
                            <li>隐私政策</li>
                            <li>用户协议</li>
                            <li> © 上海信必达网络科技有限公司</li>
                        </ul>

                    </div> */}
                </div>


            </div>
        }}>

        </Provider>
    }
}

export default Login