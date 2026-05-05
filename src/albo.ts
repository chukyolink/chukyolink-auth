// SPDX-FileCopyrightText: 2026 KATO Hayate <dev@hayatek.jp>
// SPDX-License-Identifier: AGPL-3.0-only

import fetchCookie from 'fetch-cookie';
import { CookieJar } from 'tough-cookie';
import { JSDOM } from 'jsdom';

import { defaultHttpHeaders, handleSamlResponse } from './common.ts';
import { hasShibSession } from './shib.ts';


const ALBO_LOGIN_URL: string = 'https://albo.chukyo-u.ac.jp/api/saml/login';
/** @deprecated v2.0.0で削除予定 */
const LOGIN_TYPE_CHECKING_URL: string = 'https://shib.chukyo-u.ac.jp/cloudlink/module.php/cloudlink/checktype.php';
/** @deprecated v2.0.0で削除予定 */
const LOGIN_URL: string = 'https://shib.chukyo-u.ac.jp/cloudlink/module.php/cloudlink/loginuserpass.php';
/** @deprecated v2.0.0で削除予定 */
const ACS_URL: string = 'https://albo.chukyo-u.ac.jp/api/saml/acs';
/** @deprecated v2.0.0で削除予定 */
export const ALBO_SESSION_COOKIE_NAME: string = 'KP-CHUKYO-PRODUCTION-SESSID';


/**
 * Cookieを管理するクラス。
 *
 * @deprecated v2.0.0で削除予定
 */
class CookieStore {
  cookies: Map<string, string>;

  constructor() {
    this.cookies = new Map();
  }

  /**
   * HTTPレスポンスのSet-CookieヘッダーからCookieをセットする。
   *
   * @param setCookieHeader - Set-Cookieヘッダーの値
   */
  setCookieByHeader(setCookieHeader: string[]): void {
    for (const cookiePart of setCookieHeader) {
      const [name, value] = cookiePart.split('=');
      this.cookies.set(name!.trim(), value!.split(';')[0]!.trim());
    }
  }

  /**
   * HTTPリクエストのCookieヘッダーに使用する形式でCookieを取得する。
   *
   * @returns Cookieヘッダーの値
   */
  getCookieHeader(): string {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }
}


/**
 * ログイン方法の確認リクエストの型定義。
 *
 * @deprecated v2.0.0で削除予定
 */
interface LoginTypeCheckRequest {
  AuthState: string;
  params: {
    username: string;
  };
}


/**
 * ログインリクエストの認証方法の列挙型。
 *
 * @deprecated v2.0.0で削除予定
 */
enum AuthType {
  Password = 0,
  Otp = 1,
}


/**
 * ログインリクエストの型定義。
 *
 * @deprecated v2.0.0で削除予定
 */
interface LoginRequest {
  authtype: AuthType;
  login_exec: 1;
  username: string;
  password: string;
  AuthState: string;
}


/**
 * ACSリクエストの型定義。
 *
 * @deprecated v2.0.0で削除予定
 */
interface ACSRequest {
  SAMLResponse: string;
}


/**
 * AuthStateと関連するCookieを取得する。
 *
 * @returns AuthStateとCookieのオブジェクト
 *
 * @deprecated v2.0.0で削除予定
 */
export async function getAuthState(): Promise<{ authState: string; cookieStore: CookieStore }> {
  let response = await fetch(ALBO_LOGIN_URL, { redirect: 'manual' });
  if (response.status !== 302) {
    throw new Error(`Unexpected response status: ${response.status}`);
  }
  let location = new URL(response.headers.get('location')!);

  while (!location.searchParams.has('AuthState')) {
    response = await fetch(location, { redirect: 'manual' });
    if (response.status !== 302) {
      throw new Error(`Unexpected response status: ${response.status}`);
    }
    location = new URL(response.headers.get('location')!);
  }

  const cookieStore = new CookieStore();
  cookieStore.setCookieByHeader(response.headers.getSetCookie());

  return {
    authState: location.searchParams.get('AuthState')!,
    cookieStore: cookieStore,
  };
}


/**
 * 使用可能なログイン方法を確認する。
 *
 * @param authState - AuthState
 * @param username - ユーザー名 (CU_ID)
 * @returns 使用可能なログイン方法
 *
 * @deprecated v2.0.0で削除予定
 */
async function checkLoginType(username: string, authState: string, cookieStore: CookieStore): Promise<string[]> {
  if (cookieStore.cookies.get('AWSALBCORS') === undefined || cookieStore.cookies.get('CloudLink') === undefined) {
    throw new Error('Required cookies are missing');
  }

  const requestBody: LoginTypeCheckRequest = {
    AuthState: authState,
    params: {
      username: username,
    },
  };

  const response = await fetch(LOGIN_TYPE_CHECKING_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookieStore.getCookieHeader(),
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(`Failed to check login type: ${response.statusText}`);
  }

  const responseData: { authType: string[]; sessioninfo: { AuthState: string } } = await response.json();
  return responseData.authType;
}


/**
 * 認証成功後のSAMLResponseをACSに送信してセッションIDを取得する。
 *
 * @param samlResponse - SAMLResponse
 * @param cookieStore - CookieStore
 * @returns セッションID
 *
 * @deprecated v2.0.0で削除予定
 */
async function submitAcs(samlResponse: string, cookieStore: CookieStore): Promise<string> {
  const acsRequest: ACSRequest = {
    SAMLResponse: samlResponse,
  };
  const formDataAcs = new URLSearchParams();
  for (const [key, value] of Object.entries(acsRequest)) {
    formDataAcs.append(key, String(value));
  }
  const acsResponse = await fetch(ACS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookieStore.getCookieHeader(),
    },
    body: formDataAcs.toString(),
    redirect: 'manual',
  });

  const cookies = acsResponse.headers.getSetCookie();
  const sessionId = cookies.find(cookie => (
    cookie.startsWith(ALBO_SESSION_COOKIE_NAME + '=')
  ))?.split(';')[0]!.split('=')[1];

  if (!sessionId) {
    throw new Error('Failed to retrieve session ID from ACS response');
  }

  return sessionId;
}


/**
 * ALBOログインの二段階認証のOTPを送信する関数の型定義。
 *
 * @param otp - OTP
 * @returns ALBOセッションID
 *
 * @deprecated v2.0.0で削除予定
 */
export type SubmitOtpFunction = (otp: string) => Promise<string>;


/**
 * ALBOにログインしてセッションIDを取得する。
 *
 * @param username - ユーザー名 (CU_ID)
 * @param password - パスワード
 * @param authState - AuthState
 * @param cookieStore - CookieStore
 * @returns ALBOセッションID
 *
 * @deprecated v2.0.0で削除予定
 */
async function loginAlbo(
  username: string,
  password: string,
  authState: string,
  cookieStore: CookieStore,
): Promise<string | SubmitOtpFunction> {
  const requestBody: LoginRequest = {
    authtype: AuthType.Password,
    login_exec: 1,
    username: username,
    password: password,
    AuthState: authState,
  };

  const formData = new URLSearchParams();
  for (const [key, value] of Object.entries(requestBody)) {
    if (typeof value === 'object') {
      formData.append(key, JSON.stringify(value));
    } else {
      formData.append(key, String(value));
    }
  }

  const response = await fetch(LOGIN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookieStore.getCookieHeader(),
    },
    body: formData.toString(),
  });

  if (!response.ok) {
    throw new Error(`Failed to login: ${response.statusText}`);
  }

  const responseData = await response.text();
  const dom = new JSDOM(responseData);
  const samlResponse = dom.window.document.querySelector('input[name="SAMLResponse"]')?.getAttribute('value');

  if (!samlResponse) {
    const errorArea = dom.window.document.querySelector('#ldaperror_area');
    const authType = dom.window.document.querySelector('#authtype');
    if (errorArea) {
      throw new Error('Authentication failed', { cause: new Error(errorArea.querySelector('p')?.textContent.trim()) });
    } else if (authType) {
      const authTypeValue = authType.getAttribute('value');
      if (authTypeValue === String(AuthType.Otp)) {
        const submitOtp: SubmitOtpFunction = async (otp) => {
          const otpRequestBody: LoginRequest = {
            authtype: AuthType.Otp,
            login_exec: 1,
            username: username,
            password: otp,
            AuthState: authState,
          };

          const otpFormData = new URLSearchParams();
          for (const [key, value] of Object.entries(otpRequestBody)) {
            if (typeof value === 'object') {
              otpFormData.append(key, JSON.stringify(value));
            } else {
              otpFormData.append(key, String(value));
            }
          }

          const otpResponse = await fetch(LOGIN_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Cookie': cookieStore.getCookieHeader(),
            },
            body: otpFormData.toString(),
          });

          if (!otpResponse.ok) {
            throw new Error(`Failed to submit OTP: ${otpResponse.statusText}`);
          }

          const otpResponseData = await otpResponse.text();
          const otpDom = new JSDOM(otpResponseData);
          const otpSamlResponse = otpDom.window.document
            .querySelector('input[name="SAMLResponse"]')
            ?.getAttribute('value');

          if (!otpSamlResponse) {
            const otpErrorArea = otpDom.window.document.querySelector('#ldaperror_area')
              || otpDom.window.document.querySelector('div.c-message._error');
            const error = otpErrorArea ? (
              new Error(
                'OTP authentication failed',
                {
                  cause: new Error(otpErrorArea.querySelector('p')?.textContent.trim()),
                },
              )
            ) : new Error('SAMLResponse not found in OTP response');
            throw error;
          }

          return await submitAcs(otpSamlResponse, cookieStore);
        };
        return submitOtp;
      } else {
        throw new Error(`Unexpected authentication type: ${authTypeValue}`);
      }
    }
    throw new Error('SAMLResponse not found in login response');
  }

  return await submitAcs(samlResponse, cookieStore);
}


/**
 * 利用可能なログイン方法を確認し、ALBOにログインしてセッションIDを取得する。
 *
 * パスワードログインが利用可能な場合はセッションIDを返し、OTPログインが必要な場合はOTP送信関数を返す。
 *
 * @param username - ユーザー名 (CU_ID)
 * @param password - パスワード
 * @returns ALBOセッションIDまたはOTP送信関数
 *
 * @deprecated v2.0.0で削除予定
 */
export async function getAlboSessionId(username: string, password: string): Promise<string | SubmitOtpFunction> {
  const { authState, cookieStore } = await getAuthState();
  const loginTypes = await checkLoginType(username, authState, cookieStore);

  if (!loginTypes.includes('Password') && !loginTypes.includes('OTP')) {
    throw new Error('Password login is not available for this user');
  }

  const result = await loginAlbo(username, password, authState, cookieStore);
  return result;
}


/**
 * shib.chukyo-u.ac.jpのログインセッションを利用してALBOにログインする。
 *
 * @param cookieJar - CookieJar
 */
export async function loginAlboViaShib(cookieJar: CookieJar): Promise<void> {
  const cfetch = fetchCookie(fetch, cookieJar);

  if (!await hasShibSession(cookieJar)) {
    throw new Error('No valid Shibboleth session found');
  }

  const response = await cfetch(ALBO_LOGIN_URL, { headers: { ...defaultHttpHeaders, 'Accept': 'text/html' } });
  if (!response.ok) {
    throw new Error(`Failed to initiate login: ${response.statusText}`);
  }

  await handleSamlResponse(await response.text(), cookieJar);
}
