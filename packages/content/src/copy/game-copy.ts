/**
 * Parody game copy. Satire only — no copyrighted brands used as identity, no
 * unverified factual claims (Reqs 4, 17). Full polish pass in Task 17.
 */

export interface GameCopy {
  title: string;
  subtitle: string;
  roundStart: string[];
  fightStart: string[];
  playerWin: string[];
  playerLoss: string[];
  ko: string[];
  restartHint: string;
  muteHint: string;
  unsupportedBrowser: string;
}

/** Per-fighter parody lines keyed by the fighter copy keys. */
export interface FighterCopyLines {
  win: string[];
  loss: string[];
}

export const gameCopy: GameCopy = {
  title: 'Rug Pull Rumble',
  subtitle: 'Sminem vs Bogdanoff — Proof of Fight',
  roundStart: ['ROUND 1', 'SHOW THEM THE WAY'],
  fightStart: ['Diamond hands ready… FIGHT!', 'LOADING BAGS… FIGHT!'],
  playerWin: [
    'SMINEM HOLDS THE LINE!',
    'REKT THE PAPER HANDS!',
    'BULL RUN CONFIRMED.',
  ],
  playerLoss: [
    'BOGDANOFF DUMPS AGAIN…',
    'LIQUIDATED. TYPICAL.',
    'HE WAS ON THE PHONE.',
  ],
  ko: ['K.O.', 'LIQUIDATED', 'REKT'],
  restartHint: 'Press ENTER to run it back',
  muteHint: 'Press M to mute',
  unsupportedBrowser:
    'This browser cannot run the rumble. Try a current desktop Chromium, Firefox, or Safari.',
};

export const sminemCopy: FighterCopyLines = {
  win: ['I never sold.', 'This is the way.'],
  loss: ['Not my keys, not my coins…', 'See you on the next pump.'],
};

export const bogdanoffCopy: FighterCopyLines = {
  win: ['As I predicted.', 'The dump was inevitable.'],
  loss: ['Impossible. A statistical fluke.', 'The chart lied.'],
};
