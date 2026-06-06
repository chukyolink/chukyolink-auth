# ChukyoLink Auth

中京大学の認証システムを利用するためのパッケージ。

## 使用例

```ts
import {
  AuthType, initializeLoginSession, checkAuthType, submitPassword, submitOtp,
  loginAlboViaShib, loginManaboViaShib, loginCubicsViaShib,
  logoutShib, logoutAlbo, logoutManabo, logoutCubics,
} from '@chukyolink/auth';

import fetchCookie from 'fetch-cookie';


const username = 'z999999'; // CU_ID
const { authState, cookieJar } = await initializeLoginSession();
const authTypes: AuthType[] = await checkAuthType(username, authState, cookieJar)
if (!await submitPassword(username, 'password', authState, cookieJar)) {
  if !authTypes.includes(AuthType.OTP) {
    throw new Error('OTP authentication unavailable');
  }
  await submitOtp(username, '999999', authState, cookieJar);
}
await loginAlboViaShib(cookieJar); // ALBOにログイン
await loginManaboViaShib(cookieJar); // MaNaBoにログイン
await loginCubicsViaShib(cookieJar); // CUBICSにログイン

const cfetch = fetchCookie(fetch, cookieJar);
await cfetch('https://albo.chukyo-u.ac.jp/api/class/time-table'); // 時間割情報取得

await logoutAlbo(cookieJar); // ALBOからログアウト
await logoutManabo(cookieJar); // MaNaBoからログアウト
await logoutCubics(cookieJar); // CUBICSからログアウト
await logoutShib(cookieJar); // 認証サーバーからログアウト
```

### `package.json`

```json
{
  "dependencies": {
    "@chukyolink/auth": "^2.0.0"
  }
}
```

### `.npmrc`

```npmrc
//npm.pkg.github.com/:_authToken=${GHPR_NPM_TOKEN}
@chukyolink:registry=https://npm.pkg.github.com
```
