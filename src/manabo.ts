import fetchCookie from 'fetch-cookie';
import { CookieJar } from 'tough-cookie';

import { JSDOM } from 'jsdom';


const MANABO_LOGIN_URL: string = 'https://MaNaBo.cnc.chukyo-u.ac.jp/auth/shibboleth/';
const LOGIN_TYPE_CHECKING_URL: string = 'https://shib.chukyo-u.ac.jp/cloudlink/module.php/cloudlink/checktype.php';
const LOGIN_URL: string = 'https://shib.chukyo-u.ac.jp/cloudlink/module.php/cloudlink/loginuserpass.php';
const ACS_URL: string = 'https://MaNaBo.cnc.chukyo-u.ac.jp/Shibboleth.sso/SAML2/POST';
export const MANABO_SESSION_COOKIE_NAME: string = 'GlexaSESSID';


/**
 * ログイン方法の確認リクエストの型定義。
 */
interface LoginTypeCheckRequest {
  AuthState: string;
  params: {
    username: string;
  };
}


/**
 * ログインリクエストの認証方法の列挙型。
 */
enum AuthType {
  Password = 0,
  Otp = 1,
}


/**
 * ログインリクエストの型定義。
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
 */
interface ACSRequest {
  SAMLResponse: string;
  RelayState: string;
}


/**
 * AuthStateと関連するCookieを取得する。
 *
 * @returns AuthStateとCookieのオブジェクト
 */
export async function getAuthStateM(): Promise<{ authState: string; cookieJar: CookieJar }> {
  const cookieJar = new CookieJar();
  const fetchWithCookies = fetchCookie(fetch, cookieJar);

  let response = await fetchWithCookies(MANABO_LOGIN_URL, { redirect: 'manual' });
  if (response.status !== 302) {
    throw new Error(`Unexpected response status: ${response.status}`);
  }
  let location = new URL(response.headers.get('location')!);

  while (!location.searchParams.has('AuthState')) {
    response = await fetchWithCookies(location, { redirect: 'manual' });
    if (response.status !== 302) {
      throw new Error(`Unexpected response status: ${response.status}`);
    }
    location = new URL(response.headers.get('location')!);
  }

  return {
    authState: location.searchParams.get('AuthState')!,
    cookieJar: cookieJar,
  };
}


/**
 * 使用可能なログイン方法を確認する。
 *
 * @param authState - AuthState
 * @param username - ユーザー名 (CU_ID)
 * @returns 使用可能なログイン方法
 *
 */
async function checkLoginType(username: string, authState: string, cookieJar: CookieJar): Promise<string[]> {
  const fetchWithCookies = fetchCookie(fetch, cookieJar);
  const cookies = cookieJar.getCookiesSync(LOGIN_TYPE_CHECKING_URL);
  if (!cookies.some(cookie => cookie.key === 'AWSALBCORS') || !cookies.some(cookie => cookie.key === 'CloudLink')) {
    throw new Error('Required cookies are missing');
  }

  const requestBody: LoginTypeCheckRequest = {
    AuthState: authState,
    params: {
      username: username,
    },
  };

  const response = await fetchWithCookies(LOGIN_TYPE_CHECKING_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
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
 * @param relayState - RelayState
 * @param cookieJar - CookieJar
 * @returns セッションID
 */
async function submitAcs(samlResponse: string, relayState: string, cookieJar: CookieJar): Promise<string> {
  const fetchWithCookies = fetchCookie(fetch, cookieJar);
  const acsRequest: ACSRequest = {
    SAMLResponse: samlResponse,
    RelayState: relayState,
  };
  const formDataAcs = new URLSearchParams();
  for (const [key, value] of Object.entries(acsRequest)) {
    formDataAcs.append(key, String(value));
  }
  const acsResponse = await fetchWithCookies(ACS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formDataAcs.toString(),
    redirect: 'manual',
  });

  await fetchWithCookies(acsResponse.headers.get('location')!, { method: 'GET' });
  const cookies = await cookieJar.getCookies(ACS_URL);
  const sessionCookie = cookies.find(cookie => cookie.key === MANABO_SESSION_COOKIE_NAME);

  if (!sessionCookie) {
    throw new Error('Failed to retrieve session ID from ACS response');
  }

  return sessionCookie.value;
}


/**
 * MaNaBoログインの二段階認証のOTPを送信する関数の型定義。
 *
 * @param otp - OTP
 * @returns MaNaBoセッションID
 */
export type SubmitOtpFunctionM = (otp: string) => Promise<string>;


/**
 * MaNaBoにログインしてセッションIDを取得する。
 *
 * @param username - ユーザー名 (CU_ID)
 * @param password - パスワード
 * @param authState - AuthState
 * @param cookieStore - CookieStore
 * @returns MaNaBoセッションID
 */
async function loginManabo (
  username: string,
  password: string,
  authState: string,
  cookieJar: CookieJar,
): Promise<string | SubmitOtpFunctionM> {
  const fetchWithCookies = fetchCookie(fetch, cookieJar);
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

  const response = await fetchWithCookies(LOGIN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
  });

  if (!response.ok) {
    throw new Error(`Failed to login: ${response.statusText}`);
  }

  const responseData = await response.text();
  const dom = new JSDOM(responseData);
  const samlResponse = dom.window.document.querySelector('input[name="SAMLResponse"]')?.getAttribute('value');
  const relayState = dom.window.document.querySelector('input[name="RelayState"]')?.getAttribute('value');

  if (!samlResponse || !relayState) {
    const errorArea = dom.window.document.querySelector('#ldaperror_area');
    const authType = dom.window.document.querySelector('#authtype');
    if (errorArea) {
      throw new Error('Authentication failed', { cause: new Error(errorArea.querySelector('p')?.textContent.trim()) });
    } else if (authType) {
      const authTypeValue = authType.getAttribute('value');
      if (authTypeValue === String(AuthType.Otp)) {
        const submitOtp: SubmitOtpFunctionM = async (otp) => {
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

          const otpResponse = await fetchWithCookies(LOGIN_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
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
          const otpRelayState = otpDom.window.document
            .querySelector('input[name="RelayState"]')
            ?.getAttribute('value');

          if (!otpSamlResponse || !otpRelayState) {
            const otpErrorArea = otpDom.window.document.querySelector('#ldaperror_area')
              || otpDom.window.document.querySelector('div.c-message._error');
            const error = otpErrorArea ? (
              new Error(
                'OTP authentication failed',
                {
                  cause: new Error(otpErrorArea.querySelector('p')?.textContent.trim()),
                },
              )
            ) : new Error('SAMLResponse or RelayState not found in OTP response');
            throw error;
          }

          return await submitAcs(otpSamlResponse, otpRelayState, cookieJar);
        };
        return submitOtp;
      } else {
        throw new Error(`Unexpected authentication type: ${authTypeValue}`);
      }
    }
    throw new Error('SAMLResponse not found in login response');
  }

  return await submitAcs(samlResponse, relayState, cookieJar);
}


/**
 * 利用可能なログイン方法を確認し、MaNaBoにログインしてセッションIDを取得する。
 *
 * パスワードログインが利用可能な場合はセッションIDを返し、OTPログインが必要な場合はOTP送信関数を返す。
 *
 * @param username - ユーザー名 (CU_ID)
 * @param password - パスワード
 * @returns MaNaBoセッションIDまたはOTP送信関数
 */
export async function getManaboSessionId(username: string, password: string): Promise<string | SubmitOtpFunctionM> {
  const { authState, cookieJar } = await getAuthStateM();
  const loginTypes = await checkLoginType(username, authState, cookieJar);

  if (!loginTypes.includes('Password') && !loginTypes.includes('OTP')) {
    throw new Error('Password login is not available for this user');
  }

  const result = await loginManabo(username, password, authState, cookieJar);
  return result;
}
