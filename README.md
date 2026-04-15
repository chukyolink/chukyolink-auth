# ChukyoLink Auth

中京大学の認証システムを利用するためのパッケージ。

## 使用法

```ts
import { getAlboSessionId } from '@chukyolink/auth';

let alboSessionId;
const result = await getAlboSessionId('t399999', 'password');
if (typeof result === 'function') {
  alboSessionId = await result('000000'); // OTP
} else {
  alboSessionId = result;
}
```

### `package.json`

```json
{
  "dependencies": {
    "@chukyolink/auth": "^v0.1.0"
  }
}
```

### `.npmrc`

```npmrc
//npm.pkg.github.com/:_authToken=${GITHUB_NPM_TOKEN}
@chukyolink:registry=https://npm.pkg.github.com
```
