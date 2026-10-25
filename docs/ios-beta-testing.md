# Paper Drive iOS beta test guide

These changes are a review stack: auth #22 → article/listening #23 → annotation
sync. They require the matching backend and migrations 0015–0017. They have not
been released to production or uploaded as a new TestFlight build.

## Sign in

Use an existing web account. Sign in with Discord on the matching web environment,
then open **Preferences → iOS password** to add a password. Sign in on the phone
with that account’s email and password. Password signup, email recovery, Apple
sign-in and native Discord sign-in are not available yet.

The development fixture uses an isolated database and synthetic articles.
Production accounts and private articles are not copied into test environments.
A physical iPhone cannot reach the simulator’s `localhost` backend.

## Library and offline changes

- Save an article on the web, then open the iOS app or use **Settings → Sync now**.
- Read its downloaded text, favorite it, mark it read, and archive it on either
  client. Verify those assignments reach the other client.
- Go offline, make several changes, quit and reopen the app, then reconnect.
  **Waiting changes** should drain after a successful sync.
- Save a URL from Safari’s share sheet while signed in. Repeated saves preserve
  existing content and annotations. Existing duplicate web articles retain their
  separate identities.
- Delete a disposable test article and verify it disappears from both clients.
  Deleting an account article is different from removing this device’s download.

## Notes and highlights

- Add two separate notes, including two with identical text. Edit one and delete
  the other; the untouched note should remain.
- Save a note while offline, restart, then reconnect. Verify it appears on the web.
- Add or edit a note on the web, sync iOS, and check the open reader refreshes.
- Select text and choose **Highlight**. Try all eight colors, then verify a safe
  placement on the other client. Changing color must preserve the original quote.
- Open **Highlights** for an older or changed article. A quote whose position
  cannot be verified remains available with an explanation instead of painting
  over unrelated text.

## Storage and listening

- Remove downloaded text, restart, then use **Restore saved text**. Notes and saved
  quotes should remain. **Saved text versions** exposes retained original text.
- Export JSON and check format 4 contains independent notes, highlight selectors
  and recovery versions. Re-import is not implemented.
- Sign out and sign back in as the same account. Offline data remains partitioned
  by account and server; another account must not see it.
- Use silent listening preview for player controls, paragraph starts, speed and
  sleep timer. The account adapter is connected to the shared web Google listening
  contract. Live provider quality, billing, background interruptions and physical
  device output routes still need a separately enabled speech environment.
  Login, sync, catalog and manifest requests must never generate speech.

## Known boundaries

Shared reading/listening position, rich downloaded images/PDFs, recovery import,
account recovery and native OAuth remain later work. Oversized article text and
annotation collections report a limitation and preserve local recovery data;
there is no silent truncation. Preview speech stays disabled during synthetic
verification, so these checks incur no provider generation charges.
