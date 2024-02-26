# CSMA Toolbelt

This package contains a variety of specialized utilities used by CSMA Technology to build websites and web apps.

The tools found within can be as generic as a `console.log` wrapper or as specific as a particular monkey patch we use often.

As a general rule, any tool in this package should be able to run on the client or the server.

## Utilities

### ListmonkClient

An API wrapper for [Listmonk](https://listmonk.app), which we use for all our client email campaigns.

#### Usage

```typescript
import { ListmonkClient } from '@csma/toolbelt';
import type { TransactionalEmail } from '@csma/toolbelt/listmonk';

// Listmonk API uses basic auth, so you need to provide a username and password
const listmonk = new ListmonkClient(apiUrl, username, password);

const emailData: TransactionalEmail = {...};
listmonk.sendTransactionalEmail(emailData);
```
