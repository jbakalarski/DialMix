# AGENTS.md

## Project Rules

This file contains mandatory instructions for AI coding agents working on this repository.

---

## 1. General development rules

- Read the existing codebase before making changes.
- Understand the current architecture before introducing new abstractions.
- Reuse existing components and utilities where appropriate.
- Do not unnecessarily rewrite working code.
- Keep changes focused on the current task.
- Do not introduce placeholder implementations for functionality that is expected to work.
- Do not claim that something was tested if it was not actually tested.
- Keep the project buildable whenever possible.
- Update documentation when behavior, configuration, APIs, or user-facing functionality changes.

---

## 2. Windows Audio requirements

DialMix must control the actual Windows audio sessions and devices exposed through Windows Core Audio / WASAPI.

Never replace proper Windows Audio integration with simulated keyboard volume events when implementing application, input, output, or system volume control.

Changes made through DialMix must affect the same audio state visible in the native Windows Volume Mixer.

When Windows audio state changes externally, DialMix should synchronize its internal state whenever the relevant Windows Core Audio events are available.

Prefer event-driven synchronization over polling.

---

## 3. OpenDeck requirements

Keep OpenDeck-specific functionality separated from the Windows Audio engine.

The audio engine must not depend on UI implementation details.

Hardware-specific assumptions should be avoided unless required by the OpenDeck API.

The plugin should remain extensible for additional OpenDeck-compatible devices.

---

## 4. Configuration changes

Configuration formats must be versioned.

If an existing configuration format changes, implement a migration path where appropriate.

Do not silently discard existing user configuration.

---

## 5. Documentation

All project documentation must be written in English.

Whenever a change modifies:

- Public API
- Configuration
- Installation
- Build process
- User-facing behavior
- Plugin actions
- Hardware support

update the relevant documentation.

---

## 6. Commit message generation

After **every change made during the current chat**, the AI agent MUST provide a proposed Git commit message in English.

The proposed commit message must be generated as two separate, independently copyable fields:

1. `Commit title` — a concise conventional-commit title.
2. `Commit description` — a detailed bullet list describing the complete related change.

Do not combine the title and description into one code block. Always use this format:

Commit title:

```text
<type>(<scope>): <short description>
```

Commit description:

```text
- <change>
- <change>
- <change>
```

The two fields must be immediately usable by copying them separately into the corresponding Git commit fields.

The commit message MUST take into account:

- All changes introduced during the current chat.
- Changes from earlier turns in the same chat that have not yet been committed.
- The actual state of the working tree.
- Related changes that belong to the same logical change.

Do not generate a commit message based only on the most recent file modification.

Before proposing the commit message, inspect the current working tree and determine what changes are currently uncommitted.

Use English for all commit messages.

Use conventional commit types where appropriate:

```text
feat
fix
refactor
docs
test
build
ci
chore
perf
```

Examples:

```text
feat(audio): add per-application volume control

- Add Windows Core Audio session management
- Support selecting individual application sessions
- Synchronize application volume with Windows Volume Mixer
- Add configurable volume step handling
```

or:

```text
ci(release): add automated Stream Deck plugin packaging

- Build the OpenDeck plugin in GitHub Actions
- Generate the .streamDeckPlugin package
- Create a GitHub draft release
- Upload the plugin package as a release asset
- Generate release notes from changes since the previous push
```

---

## 7. Do not commit automatically

Unless explicitly instructed by the user, do NOT run:

```bash
git commit
```

The agent should prepare and show the commit message, but leave the working tree uncommitted.

If the user explicitly asks to commit, inspect the complete diff first and then create the commit.

---

## 8. Commit scope

If multiple related changes were made during the same chat and remain uncommitted, combine them into a single coherent commit message when appropriate.

Do not describe only the last change.

For example, if the chat introduced:

- Windows audio sessions
- knob step configuration
- OpenDeck integration
- UI changes

the proposed commit should describe
