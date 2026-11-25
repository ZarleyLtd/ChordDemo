/**
 * Contextual help copy. Keys match data-help attributes (see docs/UI_CONTEXTUAL_HELP.md).
 * Text explains features, never a specific song, user or code.
 */
window.StomperHelpCatalog = {
  pages: {
    player: {
      title: 'Stomper',
      body: 'Play along with a YouTube song: the chord strip and beat grid follow the music, with synced lyrics underneath. Open the Song Library (jukebox) to pick a song. You can use everything without an account; connect to keep favourites.'
    }
  },
  topics: {
    // ------------------------------------------------------------ header, footer, shared dialog chrome
    'chrome.library': {
      title: 'Song Library',
      body: 'Opens the list of songs in Stomper. Pick one to load it, or use + inside to add a new song from a YouTube link.'
    },
    'chrome.nowTitle': {
      title: 'Now playing',
      body: 'The title and artist of the loaded song. A song that has not been analysed yet shows “Not analysed yet”.'
    },
    'chrome.account': {
      title: 'Your account',
      body: 'As a guest, this opens Connect so you can sign in with your handle and password. Once signed in (the icon turns amber), it opens your account: switch account, sign out, and for admins, invites and users.'
    },
    'chrome.close': {
      title: 'Close',
      body: 'Closes this window without changing anything. Tapping the dimmed area outside it does the same.'
    },
    'chrome.footer': {
      title: 'Credits',
      body: 'Who made Stomper.'
    },

    // ------------------------------------------------------------ player
    'player.video': {
      title: 'Video',
      body: 'The YouTube video that drives everything else. Play, pause and seek here or with the chord strip and beat grid; the chords and lyrics follow its clock.'
    },
    'player.adNote': {
      title: 'Ad playing',
      body: 'YouTube is showing an ad. Chords and lyrics wait, and pick up when the song itself starts.'
    },
    'player.strip': {
      title: 'Chord strip',
      body: 'The current chord in the middle, with the previous and next either side, and a fingering diagram for each. Tap the strip to pause or play.'
    },
    'player.lyrics': {
      title: 'Synced lyrics',
      body: 'The current line, with the one before and after. Words light up as they are sung when timing is available. Lyrics are looked up live each time a song loads.'
    },
    'player.lyricsEarlier': {
      title: 'Lyrics earlier',
      body: 'Shows the lyrics a quarter of a second sooner, if they lag behind the singing. The setting is saved for this song on this device.'
    },
    'player.lyricsLater': {
      title: 'Lyrics later',
      body: 'Shows the lyrics a quarter of a second later, if they run ahead of the singing. The setting is saved for this song on this device.'
    },
    'player.capo': {
      title: 'Capo',
      body: 'The fret your capo is on. Chord names and diagrams are rewritten as the shapes you play with the capo there. Saved for this song on this device.'
    },
    'player.capoDown': {
      title: 'Capo down',
      body: 'Moves the capo one fret lower (down to none) and redraws the chord shapes.'
    },
    'player.capoUp': {
      title: 'Capo up',
      body: 'Moves the capo one fret higher and redraws the chord shapes.'
    },
    'player.bestCapo': {
      title: 'Suggested capo',
      body: 'The capo fret that gives the easiest chord shapes for this song (0 means no capo). Tap it to use that fret. It is greyed out when you are already there.'
    },
    'player.loop': {
      title: 'Loop',
      body: 'Repeats a section for practice. Tap Loop, then tap the first and last beats in the grid; playback jumps back to the start each time it reaches the end. Tap Loop again, or a beat outside the loop, to stop.'
    },
    'player.simplify': {
      title: 'Simplify chords',
      body: 'When on, extended chords are reduced to basic shapes (for example a seventh or suspended chord becomes the plain major or minor). Turn it off to see the full chord names.'
    },
    'player.favourite': {
      title: 'Favourite',
      body: 'Stars the loaded song for your account, so you can show only favourites in the Song Library. You need to be connected; favourites follow you to any device.'
    },
    'player.meta': {
      title: 'Song details',
      body: 'Artist, title and tempo in beats per minute, from the analysis. Songs that have not been analysed say so here.'
    },
    'player.notAnalysed': {
      title: 'Not analysed yet',
      body: 'Stomper has the video but has not worked out its chords and beats. Lyrics still play. Running the command shown on a PC with the analyzer adds the chords; reload afterwards.'
    },
    'player.copyCmd': {
      title: 'Copy command',
      body: 'Copies the analyzer command for this song so you can paste it into a terminal on your PC.'
    },
    'player.grid': {
      title: 'Beat grid',
      body: 'Every beat of the song, one bar per block, with the chord written where it changes. The current beat is highlighted and the grid scrolls with the music. Tap a beat to jump there.'
    },

    // ------------------------------------------------------------ Song Library and Add New Song
    'library.add': {
      title: 'Add New Song',
      body: 'Opens a box where you paste a YouTube link. The song plays straight away with lyrics; chords appear once it has been analysed.'
    },
    'library.sort': {
      title: 'Sort order',
      body: 'Switches between sorting by title and grouping by artist. Your choice is remembered on this device.'
    },
    'library.filter': {
      title: 'Filter',
      body: 'Shows a search box so you can narrow the list by title or artist. Tap again to clear and hide it.'
    },
    'library.filterInput': {
      title: 'Filter text',
      body: 'Type part of a title or artist. The list updates as you type.'
    },
    'library.favsOnly': {
      title: 'Favourites only',
      body: 'Shows only the songs you have starred. You need to be connected. The full list comes back each time you open the library.'
    },
    'library.song': {
      title: 'Song list',
      body: 'Tap a song to load it into the player. The song you are on is marked with an amber edge.'
    },
    'add.link': {
      title: 'YouTube link',
      body: 'Paste a link to the video (a normal, short youtu.be or Shorts link all work), or just the 11-character video id.'
    },
    'add.go': {
      title: 'Go',
      body: 'Loads the video into the player. If it is new to Stomper, you can play it with lyrics straight away.'
    },

    // ------------------------------------------------------------ Connect, Register, Reset
    'connect.handle': {
      title: 'Handle',
      body: 'The short name you registered with. It is not case sensitive.'
    },
    'connect.password': {
      title: 'Password',
      body: 'The password for your handle. The same handle and password work on any device.'
    },
    'connect.submit': {
      title: 'Connect',
      body: 'Signs you in on this device. You stay connected until you sign out.'
    },
    'connect.toRegister': {
      title: 'Register',
      body: 'For new users. You need a one-time invite code from an admin; then you choose your handle and password.'
    },
    'connect.toReset': {
      title: 'Forgot password',
      body: 'Passwords can’t be recovered. Ask an admin for a one-time reset code, then use it here to set a new password.'
    },
    'register.code': {
      title: 'Invite code',
      body: 'The one-time code an admin gave you. It works once and expires; ask for a new one if it has run out.'
    },
    'register.handle': {
      title: 'Choose a handle',
      body: '3 to 20 letters or digits, no spaces. This is how you sign in, and how admins see you.'
    },
    'register.password': {
      title: 'Choose a password',
      body: 'At least 8 characters. Type it twice so a typing slip doesn’t lock you out.'
    },
    'register.submit': {
      title: 'Register',
      body: 'Creates your account, uses up the invite code and signs you in.'
    },
    'reset.handle': {
      title: 'Handle',
      body: 'The handle whose password you are resetting. It must match the one the reset code was issued for.'
    },
    'reset.code': {
      title: 'Reset code',
      body: 'The one-time code an admin issued for your handle. It works once and expires.'
    },
    'reset.password': {
      title: 'New password',
      body: 'At least 8 characters. It replaces your old password on every device.'
    },
    'reset.submit': {
      title: 'Update password',
      body: 'Saves the new password and uses up the reset code.'
    },

    // ------------------------------------------------------------ Account panel and admin
    'account.who': {
      title: 'Signed in as',
      body: 'The handle you are connected with, and whether the account is a User or an Admin.'
    },
    'account.switch': {
      title: 'Switch account',
      body: 'Opens Connect so you can sign in with a different handle on this device.'
    },
    'account.signOut': {
      title: 'Sign out',
      body: 'Disconnects this device. You can keep using the player as a guest; favourites need you to connect again.'
    },
    'admin.inviteLabel': {
      title: 'Who it’s for',
      body: 'An optional note so you can tell unused invites apart later. The person registering never sees it.'
    },
    'admin.inviteType': {
      title: 'Account type',
      body: 'User accounts can keep favourites. Admin accounts can also issue invites and reset codes, and change other accounts’ type.'
    },
    'admin.issue': {
      title: 'Issue code',
      body: 'Creates a one-time invite code to give to someone so they can register. It is shown once below; it expires if unused.'
    },
    'admin.issued': {
      title: 'New code',
      body: 'The code you just issued. Copy it now and send it to the person: it is not shown again, only listed as unused until it is used, revoked or expires.'
    },
    'admin.issuedCopy': {
      title: 'Copy code',
      body: 'Copies the new code so you can paste it into a message.'
    },
    'admin.invites': {
      title: 'Unused codes',
      body: 'Invite and reset codes that have been issued but not used yet, with when each expires.'
    },
    'admin.revoke': {
      title: 'Revoke',
      body: 'Cancels that code straight away so it can no longer be used.'
    },
    'admin.users': {
      title: 'Users',
      body: 'Every account, with when it last connected. Change an account’s type, or issue a reset code if someone has forgotten their password.'
    },
    'admin.userType': {
      title: 'Account type',
      body: 'Switches the account between User and Admin. The change applies straight away. You can’t change your own type.'
    },
    'admin.resetCode': {
      title: 'Reset code',
      body: 'Issues a one-time code that lets that person set a new password on the Reset password screen. Give it to them privately.'
    }
  }
};
