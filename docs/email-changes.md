# Administrator-assisted email changes

Only a membership administrator can start this workflow at `/admin/email-changes`.
First confirm the account holder's identity directly and record the verification method
and result, along with the private reason for the change. Do not request or upload
identity documents.

Starting a change sends a single-use verification token to the proposed address. The
account holder must sign in with the current address, open the supplied verification
link, and enter the token from that email within ten minutes. The token is bound to the
selected account and proposed address; it is never returned by the API or included in
audit projections. Local development captures this message in the local mailbox.

Only a successful verification changes the login address. The account ID, membership,
and explicitly assigned roles are retained. Existing sessions are revoked, so the
account holder must sign in again with the new address. The old address no longer
authenticates that account.

The primary administrator can review request and completion/expiry results at
`/admin/audit`. Events retain the administrator, account holder, identity-check note,
reason, outcome, and UTC timestamp; successful completion also records the old and new
addresses. Unverified, expired, replayed, wrong-account, and colliding-address attempts
do not change the login identity.
