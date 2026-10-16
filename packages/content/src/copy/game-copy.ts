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

/** Share copy for the DOM result screen (Req 14.1–14.4). Parody tone, legally safe. */
export interface ShareCopy {
  win: string[];
  loss: string[];
  url: string;
}

export const gameCopy: GameCopy = {
  title: 'Rug Pull Rumble',
  subtitle: 'Operators enter. Diamond hands prevail.',
  roundStart: ['ROUND 1', 'SHOW THEM THE WAY'],
  fightStart: ['Diamond hands ready… FIGHT!', 'LOADING BAGS… FIGHT!'],
  playerWin: [
    'YOUR OPERATOR HOLDS THE LINE!',
    'REKT THE PAPER HANDS!',
    'BULL RUN CONFIRMED.',
  ],
  playerLoss: [
    'THE OPPONENT DUMPS AGAIN…',
    'LIQUIDATED. TYPICAL.',
    'HE WAS ON THE PHONE.',
  ],
  ko: ['K.O.', 'LIQUIDATED', 'REKT'],
  restartHint: 'Run it back from the result screen',
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

export const shareCopy: ShareCopy = {
  win: [
    'My Operator just won in Rug Pull Rumble! Diamond hands prevail.',
    'Bull run confirmed — another win in Rug Pull Rumble.',
    'He was on the phone, but I still won. Rug Pull Rumble.',
  ],
  loss: [
    'My Operator got liquidated... running it back in Rug Pull Rumble.',
    'Liquidated. Typical. But I diamond-handed my way back. Rug Pull Rumble.',
    'The chart lied. One more round in Rug Pull Rumble.',
  ],
  url: 'https://rugpullrumble.xyz',
};

export const operatorCopy = {
  title: 'Choose your Operators',
  description: 'Pick any Operator from #1 to #5555 for you and the CPU. No wallet needed.',
  player: 'Player', cpu: 'CPU', tokenId: 'Operator token ID',
  load: 'Load', randomize: 'Randomize', fight: 'Fight', retry: 'Retry',
  loading: 'Loading Operator…',
  invalidId: 'Enter an Operator ID from 1 to 5555.',
  notFound: 'Operator not found. Choose another ID.',
  unavailable: 'Operator catalog unavailable. Please retry.',
  controls: 'Move: arrows · Block: Left Shift · Light high/low: A/Z · Heavy high/low: S/X · Special: C · Super: V · Mute: M. Touch controls appear in the fight.',
} as const;
