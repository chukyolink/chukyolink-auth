import { JSDOM } from 'jsdom';


const ALBO_LOGIN_URL: string = 'https://albo.chukyo-u.ac.jp/api/saml/login';
const LOGIN_TYPE_CHECKING_URL: string = 'https://shib.chukyo-u.ac.jp/cloudlink/module.php/cloudlink/checktype.php';
const LOGIN_URL: string = 'https://shib.chukyo-u.ac.jp/cloudlink/module.php/cloudlink/loginuserpass.php';
const ACS_URL: string = 'https://albo.chukyo-u.ac.jp/api/saml/acs';
export const ALBO_SESSION_COOKIE_NAME: string = 'KP-CHUKYO-PRODUCTION-SESSID';


/**
 * Cookieを管理するクラス。
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
 */
interface LoginTypeCheckRequest {
  AuthState: string;
  params: {
    username: string;
  };
}


/**
 * ログインリクエストの型定義。
 */
interface LoginRequest {
  authtype: 0;
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
}


/**
 * AuthStateと関連するCookieを取得する。
 *
 * @returns AuthStateとCookieのオブジェクト
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
 * ALBOにログインしてセッションIDを取得する。
 *
 * @param username - ユーザー名 (CU_ID)
 * @param password - パスワード
 * @param authState - AuthState
 * @param cookieStore - CookieStore
 * @returns ALBOセッションID
 */
async function loginAlbo(
  username: string,
  password: string,
  authState: string,
  cookieStore: CookieStore,
): Promise<string> {
  const requestBody: LoginRequest = {
    authtype: 0,
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

  const acsRequest: ACSRequest = {
    SAMLResponse: samlResponse!,
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
 * 利用可能なログイン方法を確認し、ALBOにログインしてセッションIDを取得する。
 *
 * @param username - ユーザー名 (CU_ID)
 * @param password - パスワード
 * @returns ALBOセッションID
 */
export async function getAlboSessionId(username: string, password: string): Promise<string> {
  const { authState, cookieStore } = await getAuthState();
  const loginTypes = await checkLoginType(username, authState, cookieStore);

  if (!loginTypes.includes('Password')) {
    throw new Error('Password login is not available for this user');
  }

  const sessionId = await loginAlbo(username, password, authState, cookieStore);
  return sessionId;
}
