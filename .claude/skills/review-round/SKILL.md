---
name: review-round
description: Handle a Tech Lead review on an MR end to end — read every comment, fix, prove, push once, reply and resolve.
---

# Review round

1. Read every comment on the MR, not only the verdict. List each as blocking or non-blocking.
2. Check each one against the code before changing anything. If a comment is wrong, answer with evidence.
3. Give the fixes to the agent that wrote the code, not a new one.
4. Every fix needs proof: a test that fails without it.
5. Merge `dev`, then push once with everything.
6. Reply on the MR with a numbered list matching the review (what changed + commit), then resolve each fixed thread.
7. One short casual line in the team group with the MR link.
