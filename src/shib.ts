// SPDX-FileCopyrightText: 2026 KATO Hayate <dev@hayatek.jp>
// SPDX-License-Identifier: AGPL-3.0-only

import fetchCookie from 'fetch-cookie';
import { CookieJar } from 'tough-cookie';

import { defaultHttpHeaders, handleSamlResponse } from './common.ts';


const SHIB_LOGIN_URL = 'https://shib.chukyo-u.ac.jp/clsp/login';
const SHIB_LOGOUT_URL = 'https://shib.chukyo-u.ac.jp/User/Logout';
const AUTH_TYPE_CHECK_URL = 'https://shib.chukyo-u.ac.jp/cloudlink/module.php/cloudlink/checktype.php';
const PASSWORD_LOGIN_URL = 'https://shib.chukyo-u.ac.jp/cloudlink/module.php/cloudlink/loginuserpass.php';
const SHIB_LOGIN_CHECK_URL = 'https://shib.chukyo-u.ac.jp/User';
const SHIB_SESSION_COOKIE_NAME = 'JSESSIONID';


/**
 * 認証方式の種類を表す列挙型。
 */
enum AuthType {
  /** パスワード認証（2段階認証なし） */
  Password = 'Password',
  /** パスワード認証（OTP必須） */
  OTP = 'OTP',
  /** FIDO認証 */
  FIDO = 'FIDO',
}


/**
 * 認証方式取得APIのリクエストの型定義。
 */
interface AuthTypeCheckRequest {
  AuthState: string;
  params: {
    UserAgent: string;
    username: string;
  };
}


/**
 * 認証方式取得APIのレスポンスの型定義。
 */
interface AuthTypeCheckResponse {
  authType: AuthType[];
  sessioninfo: {
    AuthState: string;
  };
}


/**
 * パスワード認証の操作を表す列挙型。
 */
enum PasswordAuthOperation {
  /** パスワード認証 */
  Password = '0',
  /** OTP認証 */
  OTP = '1',
  /** メール認証 */
  Email = '2',
}


/**
 * パスワード認証のリクエストの型定義。
 */
interface PasswordLoginRequest {
  authtype: PasswordAuthOperation;
  resend: '0' | '1'; // メールOTPをリクエストするとき '1'
  login_exec: '1' | '0'; // メールOTPをリクエストするとき '0'
  username: string;
  password: string; // メールOTPのリクエストのときは空文字列
  AuthState: string;
  hide?: '1'; // OTPまたはメールOTP送信のときのみ設定可能
}


/**
 * ログインセッションを初期化し、AuthStateパラメータとCookieJarを返す。
 *
 * @returns AuthStateパラメータとCookieJarを含むオブジェクト
 */
export async function initializeLoginSession(): Promise<{ authState: string, cookieJar: CookieJar }> {
  const cookieJar = new CookieJar();
  const cfetch = fetchCookie(fetch, cookieJar);

  const response = await cfetch(SHIB_LOGIN_URL, { headers: { ...defaultHttpHeaders, 'Accept': 'text/html' } });
  if (!response.ok) {
    throw new Error(`Failed to initialize login session: ${response.status} ${response.statusText}`);
  }

  const authState = new URL(response.url).searchParams.get('AuthState');
  if (!authState) {
    throw new Error('Failed to initialize login session: AuthState parameter not found in redirect URL');
  }

  return { authState, cookieJar };
}


/**
 * 利用可能な認証方式をチェックする。
 *
 * @param username - ユーザー名（CU_ID）
 * @param authState - AuthState
 * @param cookieJar - CookieJar
 * @returns 利用可能な認証方式の配列
 */
export async function checkAuthType(username: string, authState: string, cookieJar: CookieJar): Promise<AuthType[]> {
  const cfetch = fetchCookie(fetch, cookieJar);

  const payload: AuthTypeCheckRequest = {
    AuthState: authState,
    params: {
      UserAgent: defaultHttpHeaders['User-Agent'],
      username: username,
    },
  };

  const response = await cfetch(AUTH_TYPE_CHECK_URL, {
    method: 'POST',
    headers: defaultHttpHeaders,
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Failed to check authentication type: ${response.status} ${response.statusText}`);
  }

  const jsonResponse = await response.json() as AuthTypeCheckResponse;
  return jsonResponse.authType;
}


/**
 * 認証APIにパスワードを送信する。
 *
 * @param username - ユーザー名（CU_ID）
 * @param password - パスワード
 * @param authState - AuthState
 * @param cookieJar - CookieJar
 * @returns 認証が完了した場合はtrueを返し、OTP認証が必要な場合はfalseを返す
 * @throws 認証に失敗した場合
 */
export async function submitPassword(
  username: string, password: string, authState: string, cookieJar: CookieJar,
): Promise<boolean> {
  const cfetch = fetchCookie(fetch, cookieJar);

  const payload = {
    authtype: PasswordAuthOperation.Password,
    resend: '0',
    login_exec: '1',
    username: username,
    password: password,
    AuthState: authState,
  } satisfies PasswordLoginRequest;

  const response = await cfetch(PASSWORD_LOGIN_URL, {
    method: 'POST',
    headers: { ...defaultHttpHeaders, 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'text/html' },
    body: new URLSearchParams(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to submit password authentication: ${response.status} ${response.statusText}`);
  }

  return handleSamlResponse(await response.text(), cookieJar);
}


/**
 * メールOTPをリクエストする。
 *
 * @param username - ユーザー名（CU_ID）
 * @param authState - AuthState
 * @param cookieJar - CookieJar
 * @throws 認証に失敗した場合
 */
export async function requestEmailOtp(username: string, authState: string, cookieJar: CookieJar): Promise<void> {
  const cfetch = fetchCookie(fetch, cookieJar);
  const payload = {
    authtype: PasswordAuthOperation.Email,
    resend: '1',
    login_exec: '0',
    username: username,
    password: '',
    AuthState: authState,
  } satisfies PasswordLoginRequest;
  const response = await cfetch(PASSWORD_LOGIN_URL, {
    method: 'POST',
    headers: { ...defaultHttpHeaders, 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'text/html' },
    body: new URLSearchParams(payload),
  });
  if (!response.ok) {
    throw new Error(`Failed to request email OTP: ${response.status} ${response.statusText}`);
  }
}


/**
 * 認証APIにOTPを送信する。
 * @param username - ユーザー名（CU_ID）
 * @param otp - OTP
 * @param authState - AuthState
 * @param cookieJar - CookieJar
 * @param isTrustDevice - 次回以降のOTP認証を省略するフラグ（デフォルトはfalse）
 * @param isEmailOtp - OTPがメールOTPであるかどうかを示すフラグ（デフォルトはfalse）
 * @throws 認証に失敗した場合
 */
export async function submitOtp(
  username: string, otp: string, authState: string, cookieJar: CookieJar,
  isTrustDevice: boolean = false, isEmailOtp: boolean = false,

): Promise<void> {
  const cfetch = fetchCookie(fetch, cookieJar);

  const payload = {
    authtype: isEmailOtp ? PasswordAuthOperation.Email : PasswordAuthOperation.OTP,
    resend: '0',
    login_exec: '1',
    username: username,
    password: otp,
    AuthState: authState,
    ...(isTrustDevice && { hide: '1' }),
  } satisfies PasswordLoginRequest;

  const response = await cfetch(PASSWORD_LOGIN_URL, {
    method: 'POST',
    headers: { ...defaultHttpHeaders, 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'text/html' },
    body: new URLSearchParams(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to submit OTP authentication: ${response.status} ${response.statusText}`);
  }

  const samlResponse = await handleSamlResponse(await response.text(), cookieJar);
  if (!samlResponse) {
    throw new Error('Failed to submit OTP authentication: SAMLResponse not found in response');
  }
}


/**
 * shib.chukyo-u.ac.jpにログインセッションが存在するかをチェックする。
 *
 * @param cookieJar - CookieJar
 * @returns セッションの有無
 */
export async function hasShibSession(cookieJar: CookieJar): Promise<boolean> {
  const cookies = await cookieJar.getCookies(SHIB_LOGIN_CHECK_URL);
  return cookies.some((cookie) => cookie.key === SHIB_SESSION_COOKIE_NAME);
}


/**
 * shib.chukyo-u.ac.jpからログアウトする。
 *
 * @param cookieJar - CookieJar
*/
export async function logoutShib(cookieJar: CookieJar): Promise<void> {
  const cfetch = fetchCookie(fetch, cookieJar);
  // エラーチェックをすべきではあるが、認証システムに不具合があるため修正されるまでは無視する
  await cfetch(SHIB_LOGOUT_URL, { headers: { ...defaultHttpHeaders, 'Accept': 'text/html' } });
}
