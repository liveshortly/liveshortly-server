# Sharing & visibility

Decide who can open a session and who can send messages to it. You need to own the session.

## The four visibility levels

| Level | Who can open it | Needs to sign in |
| --- | --- | --- |
| Private | You and the people you invite | Yes |
| Anyone with the link | Any signed-in person who has the link | Yes |
| Public | Any signed-in person; listed on your profile | Yes |
| Open | Anyone, without an account | No (to watch) |

New sessions are private. For link and public sessions you also choose whether people with the link can watch only, or watch and comment. Commenting always requires signing in, even on open sessions.

Change the level from the Share control on the session page.

## Invite people by email

Invited people can open the session even when it is private. Give each person a role:

- **Viewer:** can watch.
- **Commenter:** can watch and send messages to the agent.

From the terminal:

```bash
live share <id> them@example.com                # commenter
live share <id> them@example.com --role viewer  # watch only
live share <id> --list                          # who has access
live shared                                     # sessions shared with you
```

If the person has no account yet, the invite applies when they first sign in with that email.

## Share to X

Share to X makes the session public and opens a pre-filled post. The link shows a preview card with the session title, author and a prompt line.
