# Sharing & visibility

Decide who can open a session and who can send messages to it. You need to own the session. New sessions are private.

## The four visibility levels

| Level | Who can open it | Listed anywhere | Needs to sign in to watch |
| --- | --- | --- | --- |
| Private | You and the people you invite | No | Yes |
| Anyone with the link | Any signed-in person who has the link | No | Yes |
| Public | Any signed-in person who has the link | Can appear on the feed and your profile | Yes |
| Open | Anyone with the link | Can appear on the feed | No |

Sending messages always needs a signed-in account with comment access, even on an open session.

## Change who can open a session

1. Open the session page and choose **Share**.
2. Under **Who can open it**, pick a level. The current level is marked `· current`.
3. The sheet explains what changes. Choose **Make it …** (for example **Make it public**) to apply it, or **Cancel**. Every change is confirmed this way, so a session is never opened by accident.

The share sheet also has:

- **Link:** the session URL with a **Copy** button. While the session is private, the sheet tells you the link only works for you until access is widened.
- **People with the link can:** **Watch**, or **Watch and comment**. This is the link role, and it applies to the link, public and open levels.
- **Public feed:** publish or unpublish. See [Publishing to the feed](/docs/publishing).
- **Share to 𝕏** and **Copy embed code**.
- **Continue in your terminal:** the handoff command for this session. See [Forks & handoff](/docs/forks-and-handoff).

## Invite people by email

Invited people can open the session even when it is private. Give each person a role:

- **Watch** (viewer): can watch.
- **Comment** (commenter): can watch, send messages to the agent, and answer permission requests from `live join`.

In the share sheet, enter the email under **Invite people**, pick the role and send. From the terminal:

```bash
live share <id> them@example.com                # commenter
live share <id> them@example.com --role viewer  # watch only
live share <id> --list                          # who has access
live shared                                     # sessions shared with you
```

If the person has no account yet, the invite applies when they first sign in with that email. Invites are not sent by email: send them the link yourself.

To invite people to several sessions at once, select them in your session list and use **Invite people**. Each selected session gets the same invite.

## Share to X

**Share to 𝕏** makes the session public and opens a pre-filled post. The link shows a preview card with the session title, the author and a prompt line. Local paths, emails and `*.local` hostnames in the card are hidden (see [Publishing](/docs/publishing#what-is-hidden-from-other-people)).

## Per agent

Visibility and invites work the same for every agent. What a viewer can do with comment access depends on the agent: see [Watching & commenting](/docs/watching-and-commenting#send-a-message-to-the-agent).

## If it doesn't work

- **"no access"** from `live join`, `live watch` or a fork: the session is private and you are not invited, or you are signed in with a different email. Check `live whoami`.
- **The person you invited can't open it.** They must sign in with exactly the invited email address.
- **Someone sees "Read only — you can watch but not comment."** Give them the **Comment** role, or set the link role to **Watch and comment**.
- **Viewers are asked to sign in.** Only open sessions can be watched without an account.

## Related

- [Publishing to the feed](/docs/publishing)
- [Watching & commenting](/docs/watching-and-commenting)
- [Forks & handoff](/docs/forks-and-handoff)
