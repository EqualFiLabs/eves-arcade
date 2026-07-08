# Requirements Document

> **Status update (2026-07-07):** The project is evolving into a multi-game crypto meme arcade — see `.kiro/specs/arcade-platform-v1/`. This spec remains the record for the Rug Pull Rumble fight itself. Two scoped changes:
>
> 1. **Requirement 18 non-goals are V1-scoped, not permanent.** Backend services (18.9), token rewards (18.7), mobile controls (18.11), and leaderboard infrastructure are now *planned platform work* under `arcade-platform-v1` (session tickets, server-side replay verification, touch controls). The V1 fight itself still satisfies all of Requirement 18: unranked play must remain fully playable from static hosting with no backend (this constraint is preserved as `arcade-platform-v1` Requirement 9.5).
> 2. **Task 18's `ResultScene`/`ShareView`/`DistributionHookView` are superseded** by the shared DOM arcade result screen (`arcade-platform-v1` Requirement 4 / Task 4.2). Requirements 13 and 14 (distribution hooks, shareability) still hold — they are satisfied by the shell surface instead of an in-Phaser scene. Requirement 3.6 (restart without refresh) is satisfied via shell relaunch.

## Introduction

Proof of Fight V1 is a browser-based, crypto-themed parody fighting game built as a greenfield Phaser 4 project. The first release shall deliver a shareable no-install Player vs CPU fight featuring Sminem against Bogdanoff, with fast loading, meme-forward presentation, tight arcade combat, and distribution hooks for directing players toward related projects after the match. V1 shall prioritize viral playability and a polished vertical slice over roster size, online multiplayer, account systems, or blockchain integration.

## Glossary

- **V1:** The first playable release of the game.
- **Player:** The human user controlling the playable fighter in the browser.
- **CPU:** The local computer-controlled opponent.
- **Sminem:** The V1 playable crypto parody fighter.
- **Bogdanoff:** The V1 CPU boss fighter.
- **Fight Scene:** The active gameplay scene where the Player and CPU fight.
- **Parody Meme Tone:** Exaggerated, comedic, crypto-culture-inspired presentation intended for satire and viral sharing.
- **Distribution Hook:** A post-fight or menu surface that directs players to configured external project links.
- **No-Install Play:** The ability to play directly in a modern browser without downloading an executable, browser extension, wallet, or native app.
- **Static Deploy:** A deployment model where the V1 game can run from static web hosting without a backend service.
- **Move:** A fighter action with defined timing, animation, damage, hit behavior, and recovery.
- **Hitbox:** The active offensive collision area of a move.
- **Hurtbox:** The vulnerable collision area of a fighter.
- **Hitstun:** The period after being hit during which a fighter cannot act.
- **Blockstun:** The period after blocking during which a fighter cannot act.
- **Meter:** A resource built during combat and spent on enhanced actions or a super move.
- **KO:** The end condition when a fighter's health reaches zero.

## Requirements

### Requirement 1: Browser-Based No-Install Play

**User Story:** As a casual player, I want to open the game from a link in my browser, so that I can play immediately without installing anything.

#### Acceptance Criteria

1. WHEN the Player opens the V1 game URL in a supported desktop browser, THE game SHALL load into an interactive menu or fight start state without requiring installation.
2. WHEN the game loads, THE game SHALL NOT require a wallet connection, account creation, browser extension, native app, or downloadable executable.
3. WHEN the game is deployed, THE game SHALL be capable of running from static web hosting.
4. IF the browser does not support required runtime features, THEN THE game SHALL show a readable unsupported-browser message instead of failing silently.
5. WHEN assets are loading, THE game SHALL show visible loading progress or loading feedback.
6. WHEN the initial load completes, THE Player SHALL be able to start the V1 fight from the browser page.

### Requirement 2: Phaser 4 Greenfield Foundation

**User Story:** As the developer, I want V1 built as a greenfield Phaser 4 project, so that the game has a clean browser-first foundation for fast iteration.

#### Acceptance Criteria

1. WHEN the project is initialized, THE game SHALL use Phaser 4 as the browser game framework.
2. WHEN the project is built, THE build SHALL produce browser-ready static assets.
3. WHEN the game runs locally, THE developer SHALL be able to start a development server and play the V1 fight in a browser.
4. WHEN the game is built for release, THE build output SHALL be suitable for deployment to a static hosting provider.
5. IF future features require backend services, THEN V1 SHALL NOT depend on those services to complete the core fight.

### Requirement 3: V1 Fight Scope

**User Story:** As a player, I want a focused Sminem vs Bogdanoff fight, so that the first release feels complete instead of unfinished.

#### Acceptance Criteria

1. WHEN the Player starts V1, THE game SHALL present Sminem as the playable fighter.
2. WHEN the fight begins, THE game SHALL spawn Bogdanoff as the CPU opponent.
3. WHEN the fight begins, THE game SHALL use one playable stage.
4. WHEN either fighter reaches zero health, THE game SHALL end the round with a KO result.
5. WHEN the round ends, THE game SHALL show whether the Player won or lost.
6. WHEN the round ends, THE Player SHALL be able to restart the fight without refreshing the browser.
7. THE V1 game SHALL NOT require a character select screen with multiple playable characters.
8. THE V1 game SHALL NOT require a campaign, ladder, ranked mode, or online multiplayer.

### Requirement 4: Parody Meme Presentation

**User Story:** As a crypto-native player, I want the game to feel like a ridiculous crypto meme fight, so that it is funny enough to share.

#### Acceptance Criteria

1. WHEN the game displays fighter names, move names, UI text, or stage text, THE content SHALL use a parody crypto meme tone.
2. WHEN the Player fights Bogdanoff, THE game SHALL include recognizable market-manipulation parody flavor without presenting factual claims as real-world accusations.
3. WHEN Sminem performs signature actions, THE game SHALL use crypto meme language, visuals, or sound cues associated with retail hero energy.
4. WHEN Bogdanoff performs signature actions, THE game SHALL use crypto meme language, visuals, or sound cues associated with market villain energy.
5. WHEN the game shows round start, KO, victory, defeat, or restart text, THE text SHALL reinforce the parody crypto theme.
6. IF any content references public figures, projects, chains, or crypto communities, THEN THE game SHALL present the content as satire, parody, or fictionalized exaggeration.
7. THE V1 game SHALL prioritize comedic memorability over lore depth.

### Requirement 5: Player Controls

**User Story:** As a player, I want simple responsive controls, so that I can understand and enjoy the fight quickly.

#### Acceptance Criteria

1. WHEN the fight is active, THE Player SHALL be able to move left and right.
2. WHEN the fight is active, THE Player SHALL be able to jump.
3. WHEN the fight is active, THE Player SHALL be able to crouch.
4. WHEN the fight is active, THE Player SHALL be able to block.
5. WHEN the fight is active, THE Player SHALL be able to perform a light attack.
6. WHEN the fight is active, THE Player SHALL be able to perform a heavy attack.
7. WHEN the fight is active, THE Player SHALL be able to perform at least one special move.
8. WHEN the fight is active, THE Player SHALL be able to perform one meter-based super move if sufficient meter is available.
9. WHEN the Player enters an invalid action for the current state, THE game SHALL ignore the invalid action without breaking fighter state.
10. WHEN the Player uses the default keyboard layout, THE controls SHALL be playable without requiring a gamepad.
11. IF gamepad support is included in V1, THEN keyboard controls SHALL remain fully supported.

### Requirement 6: Core Combat Rules

**User Story:** As a player, I want attacks, blocks, damage, and movement to behave consistently, so that the fight feels fair and learnable.

#### Acceptance Criteria

1. WHEN a fighter attack connects with the opposing fighter's hurtbox during active frames, THE game SHALL apply damage according to the move definition.
2. WHEN a fighter attack connects, THE defender SHALL enter hitstun unless a defined exception applies.
3. WHEN a fighter blocks a blockable attack, THE game SHALL apply blockstun and reduced or zero damage according to the move definition.
4. WHEN a move is in startup, active, or recovery frames, THE fighter SHALL follow the allowed actions for that move state.
5. WHEN a fighter is in hitstun, blockstun, KO, or another non-controllable state, THE fighter SHALL NOT perform normal player-controlled actions.
6. WHEN both fighters collide through movement, THE game SHALL prevent invalid overlap using pushbox or equivalent collision behavior.
7. WHEN a fighter is facing the opponent, THE fighter's attacks SHALL resolve in the correct direction.
8. WHEN fighters cross sides, THE game SHALL update fighter facing consistently.
9. WHEN a fighter's health reaches zero, THE fighter SHALL enter KO state and the round SHALL stop accepting normal combat input.
10. WHEN combat state changes, THE visual presentation SHALL reflect the current combat state clearly enough for the Player to understand what happened.

### Requirement 7: Sminem Fighter Kit

**User Story:** As a player, I want Sminem to have a small but expressive moveset, so that the playable fighter feels distinct and meme-worthy.

#### Acceptance Criteria

1. WHEN the Player controls Sminem, THE game SHALL provide idle, movement, attack, hit reaction, and KO presentation states.
2. WHEN Sminem performs a light attack, THE move SHALL be faster and lower damage than the heavy attack.
3. WHEN Sminem performs a heavy attack, THE move SHALL be slower and higher damage than the light attack.
4. WHEN Sminem performs a special move, THE move SHALL have distinct crypto meme presentation.
5. WHEN Sminem has sufficient meter, THE Player SHALL be able to perform one super move.
6. WHEN Sminem performs the super move, THE move SHALL spend meter.
7. WHEN Sminem lands attacks or receives defined combat events, THE game SHALL update Sminem's meter according to the meter rules.
8. WHEN Sminem wins, THE game SHALL show a parody victory presentation specific to Sminem.
9. WHEN Sminem loses, THE game SHALL show a parody defeat presentation specific to Sminem.

### Requirement 8: Bogdanoff CPU Boss Kit

**User Story:** As a player, I want Bogdanoff to feel like a funny CPU boss, so that the V1 fight has a memorable opponent.

#### Acceptance Criteria

1. WHEN the fight starts, THE CPU SHALL control Bogdanoff without requiring network access.
2. WHEN Bogdanoff is idle, moving, attacking, hit, blocking, or KO'd, THE game SHALL show presentation states that match the current state.
3. WHEN Bogdanoff attacks, THE game SHALL include at least one light or basic attack.
4. WHEN Bogdanoff attacks, THE game SHALL include at least one heavier or more dangerous boss attack.
5. WHEN Bogdanoff uses a signature action, THE action SHALL include market-villain parody presentation.
6. WHEN Bogdanoff receives damage, THE game SHALL reduce Bogdanoff's health according to combat rules.
7. WHEN Bogdanoff reaches zero health, THE game SHALL show a Player victory result.
8. WHEN Bogdanoff defeats Sminem, THE game SHALL show a Player defeat result.
9. THE Bogdanoff CPU SHALL be beatable by a first-time player after reasonable attempts.
10. THE Bogdanoff CPU SHALL be dangerous enough that the Player can lose if they ignore blocking, spacing, and attack timing.

### Requirement 9: Local CPU Behavior

**User Story:** As a player, I want the CPU opponent to react believably, so that the fight feels like a game rather than a punching bag.

#### Acceptance Criteria

1. WHEN the fight is active, THE CPU SHALL choose actions locally without a backend service.
2. WHEN the Player is far away, THE CPU SHALL be able to approach, hold position, or use a ranged or advancing action if available.
3. WHEN the Player is close, THE CPU SHALL be able to attack, block, retreat, or use a boss action.
4. WHEN the Player repeatedly blocks, THE CPU SHALL have at least one behavior that pressures or counters passive blocking.
5. WHEN the Player whiffs an attack near Bogdanoff, THE CPU SHALL be able to punish under defined conditions.
6. WHEN Bogdanoff is in hitstun, blockstun, KO, or an invalid action state, THE CPU SHALL NOT issue actions that violate combat rules.
7. WHEN the CPU selects actions, THE CPU SHALL include enough variation to avoid identical behavior every round.
8. IF difficulty tuning is included in V1, THEN difficulty SHALL affect CPU behavior parameters rather than only changing damage numbers.

### Requirement 10: Health, Meter, and Round UI

**User Story:** As a player, I want clear health, meter, and round feedback, so that I understand the fight state at a glance.

#### Acceptance Criteria

1. WHEN the fight is active, THE game SHALL display Sminem's health.
2. WHEN the fight is active, THE game SHALL display Bogdanoff's health.
3. WHEN the fight is active, THE game SHALL display Sminem's meter if meter is available.
4. WHEN health changes, THE health UI SHALL update visibly.
5. WHEN meter changes, THE meter UI SHALL update visibly.
6. WHEN the round starts, THE game SHALL show a themed round start message.
7. WHEN the round ends, THE game SHALL show a themed KO, victory, or defeat message.
8. WHEN the Player can restart, THE game SHALL show the available restart action.
9. WHEN the Player wins or loses, THE result screen SHALL make the outcome obvious without requiring text parsing alone.

### Requirement 11: Stage and Visual Feedback

**User Story:** As a player, I want the fight to have a memorable crypto-themed arena and strong hit feedback, so that the game feels polished enough to share.

#### Acceptance Criteria

1. WHEN the fight starts, THE game SHALL render one crypto-themed stage.
2. WHEN fighters move, THE camera or viewport SHALL keep both fighters visible during normal play.
3. WHEN a hit connects, THE game SHALL show visual hit feedback such as hit sparks, impact effects, screen shake, freeze frames, or equivalent feedback.
4. WHEN a hit is blocked, THE game SHALL show block feedback that is visually distinct from a clean hit.
5. WHEN a special or super move occurs, THE game SHALL show stronger visual emphasis than normal attacks.
6. WHEN a fighter is KO'd, THE game SHALL show a distinct KO presentation.
7. WHEN visual effects play, THE effects SHALL NOT hide essential combat information for an unreasonable duration.
8. WHEN the game runs on a supported browser, THE stage and fighter presentation SHALL remain legible at the target resolution.

### Requirement 12: Audio Feedback

**User Story:** As a player, I want sound effects and meme audio cues, so that actions feel satisfying and shareable.

#### Acceptance Criteria

1. WHEN the Player selects or starts the fight, THE game SHALL play an appropriate UI or start sound if audio is enabled.
2. WHEN attacks are performed, THE game SHALL play attack sound effects if audio is enabled.
3. WHEN attacks hit or are blocked, THE game SHALL play distinct hit or block sound effects if audio is enabled.
4. WHEN a special or super move occurs, THE game SHALL play distinct audio feedback if audio is enabled.
5. WHEN the round ends, THE game SHALL play victory, defeat, or KO audio feedback if audio is enabled.
6. WHEN the browser blocks autoplay audio, THE game SHALL still be playable and SHALL enable audio after user interaction where possible.
7. WHEN audio is available, THE Player SHALL be able to mute or unmute game audio.
8. THE V1 game SHALL NOT require copyrighted music, voice clips, or audio assets that the project does not have rights to use.

### Requirement 13: Distribution Hooks

**User Story:** As the creator, I want the game to direct attention toward related projects, so that the viral game can become a distribution channel.

#### Acceptance Criteria

1. WHEN the Player reaches the win or loss result screen, THE game SHALL display at least one configured distribution hook.
2. WHEN a distribution hook is displayed, THE hook SHALL be clearly separate from the core fight controls.
3. WHEN the Player activates a distribution hook, THE game SHALL open or navigate to the configured external destination.
4. WHEN distribution hooks are configured, THE links SHALL be editable without modifying core combat logic.
5. WHEN distribution hooks are shown, THE game SHALL NOT require the Player to click them before replaying the fight.
6. WHEN the game is shared, THE distribution hooks SHALL remain available in the deployed build.
7. IF a distribution destination is missing or disabled, THEN THE game SHALL hide or disable that hook without breaking the result screen.

### Requirement 14: Shareability

**User Story:** As a player, I want the game to be easy to share, so that I can send it to others after playing.

#### Acceptance Criteria

1. WHEN the Player accesses the deployed game, THE game SHALL be playable from a normal URL.
2. WHEN the Player reaches a result screen, THE game SHALL provide copy suitable for sharing the game or result.
3. WHEN sharing copy is provided, THE copy SHALL match the parody meme tone.
4. WHEN a share action is available, THE action SHALL NOT require account creation or wallet connection.
5. IF the browser supports clipboard sharing, THEN THE game MAY provide a copy action for the share text or URL.
6. IF the browser does not support clipboard sharing, THEN THE game SHALL still display shareable text or a shareable URL.
7. THE V1 game SHALL NOT require a backend leaderboard to be shareable.

### Requirement 15: Performance and Responsiveness

**User Story:** As a player, I want the game to feel responsive in the browser, so that the fight does not feel laggy or broken.

#### Acceptance Criteria

1. WHEN the fight is active on a supported desktop browser, THE game SHALL target smooth real-time play.
2. WHEN the Player presses a movement or attack input, THE game SHALL reflect the input with minimal perceptible delay.
3. WHEN the game updates combat state, THE combat rules SHALL advance at a consistent fixed step or equivalent deterministic timing model.
4. WHEN temporary frame drops occur, THE game SHALL avoid corrupting combat state.
5. WHEN assets are loaded, THE game SHALL avoid unnecessary network requests during active combat.
6. WHEN the game runs from static hosting, THE asset size SHALL remain reasonable for casual link sharing.
7. IF performance falls below the playable target, THEN THE game SHALL remain recoverable through restart or refresh without persisting corrupted state.

### Requirement 16: Developer Debugging Support

**User Story:** As the developer, I want basic combat debugging tools, so that I can tune the fight quickly.

#### Acceptance Criteria

1. WHEN debug mode is enabled, THE game SHALL display relevant combat state such as fighter state, health, meter, or current move.
2. WHEN debug mode is enabled, THE game SHALL be able to display hitboxes, hurtboxes, or equivalent collision visualization.
3. WHEN debug mode is disabled, THE game SHALL hide debug visuals from normal players.
4. WHEN the developer changes move data, THE game SHALL allow move tuning without rewriting unrelated game systems.
5. WHEN a combat bug occurs during development, THE developer SHALL have enough visible state to identify the likely current fighter state.
6. THE deployed public V1 build SHALL NOT expose intrusive debug UI by default.

### Requirement 17: Content Rights and Safety Constraints

**User Story:** As the creator, I want the parody game to be shareable without obvious rights problems, so that distribution is not blocked by avoidable asset or messaging issues.

#### Acceptance Criteria

1. THE V1 game SHALL NOT include copyrighted music, sprites, voice clips, logos, or artwork unless the project has permission or a valid license.
2. THE V1 game SHALL NOT use the Mortal Kombat name, logo, exact UI, exact characters, exact fatalities, or other protected presentation as game branding.
3. WHEN the game references crypto culture, THE content SHALL be presented as parody, satire, or fictionalized exaggeration.
4. WHEN public figures or communities are referenced, THE content SHALL avoid presenting unverified harmful factual claims as fact.
5. WHEN project links are shown, THE game SHALL avoid implying endorsement from referenced people, chains, communities, or projects unless endorsement exists.
6. WHEN the game is distributed publicly, THE game SHALL include any required attribution for licensed assets.
7. IF an asset license requires attribution, THEN THE game SHALL include the attribution in a credits or equivalent location.

### Requirement 18: V1 Non-Goals

**User Story:** As the developer, I want the first release scoped tightly, so that V1 can ship instead of becoming a full fighting game platform.

#### Acceptance Criteria

1. THE V1 game SHALL NOT require online multiplayer.
2. THE V1 game SHALL NOT require rollback netcode.
3. THE V1 game SHALL NOT require matchmaking.
4. THE V1 game SHALL NOT require ranked mode.
5. THE V1 game SHALL NOT require wallet login.
6. THE V1 game SHALL NOT require blockchain transactions.
7. THE V1 game SHALL NOT require token rewards.
8. THE V1 game SHALL NOT require persistent accounts.
9. THE V1 game SHALL NOT require a backend database.
10. THE V1 game SHALL NOT require a full roster beyond Sminem and Bogdanoff.
11. THE V1 game SHALL NOT require mobile controls unless explicitly added after V1.
12. THE V1 game SHALL NOT require a story campaign.
13. THE V1 game SHALL NOT require a level editor, modding support, or user-generated content.
