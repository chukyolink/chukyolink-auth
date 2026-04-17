import fetchCookie from 'fetch-cookie';
import { CookieJar } from 'tough-cookie';

import { defaultHttpHeaders, handleSamlResponse } from './common.ts';


const INITIALIZATION_URL = 'https://shib.chukyo-u.ac.jp/clsp/login';
const AUTH_TYPE_CHECK_URL = 'https://shib.chukyo-u.ac.jp/cloudlink/module.php/cloudlink/checktype.php';
const PASSWORD_LOGIN_URL = 'https://shib.chukyo-u.ac.jp/cloudlink/module.php/cloudlink/loginuserpass.php';


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
}


/**
 * パスワード認証のリクエストの型定義。
 */
interface PasswordLoginRequest {
  authtype: PasswordAuthOperation;
  login_exec: '1';
  username: string;
  password: string;
  AuthState: string;
}


/**
 * ログインセッションを初期化し、AuthStateパラメータとCookieJarを返す。
 *
 * @returns AuthStateパラメータとCookieJarを含むオブジェクト
 */
export async function initializeLoginSession(): Promise<{ authState: string, cookieJar: CookieJar }> {
  const cookieJar = new CookieJar();
  const cfetch = fetchCookie(fetch, cookieJar);

  const response = await cfetch(INITIALIZATION_URL, { headers: { ...defaultHttpHeaders, 'Accept': 'text/html' } });
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

  const jsonResponse: AuthTypeCheckResponse = await response.json();
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
 * 認証APIにOTPを送信する。
 * @param username - ユーザー名（CU_ID）
 * @param otp - OTP
 * @param authState - AuthState
 * @param cookieJar - CookieJar
 * @throws 認証に失敗した場合
 */
export async function submitOtp(
  username: string, otp: string, authState: string, cookieJar: CookieJar,
): Promise<void> {
  const cfetch = fetchCookie(fetch, cookieJar);

  const payload = {
    authtype: PasswordAuthOperation.OTP,
    login_exec: '1',
    username: username,
    password: otp,
    AuthState: authState,
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
