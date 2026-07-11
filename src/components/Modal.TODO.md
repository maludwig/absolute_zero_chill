# Modal.TODO.md

Mostly OK — seven modal components, clean and readable.

## Minor

- Two shapes coexist: the story-beat modals (Prelude, Act1Complete, UserMatrix, Ark,
  ActOne) delegate to `<ChatModal>` and are three-line wrappers; the two milestone
  modals (ActTwo, Finale) are hand-written inline JSX with bespoke prose. That's a
  reasonable split (chat vs narrator card), but the ActTwo/Finale bodies are ~40 lines
  of literary copy embedded in the component. If any of that prose ever needs editing by
  a non-coder, consider moving it to a data file like the ChatModal ones already use
  (`story/chats.json`). Not urgent — it's stable narrative text.
- `FmtValue.jsx`'s header comment claims "Not wired into anything yet" — that's stale;
  it's used across a dozen components. See FmtValue's own TODO. (Noted here only because I
  first spotted it while reading Modal.)
