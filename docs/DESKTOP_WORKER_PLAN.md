# Plan: analyse songs on the home desktop

Status: **planned, not started** (saved 18 Nov 2026).

**Goal:** request chords from the phone and have the always-plugged-in desktop analyse the song and publish it automatically.

**Why a machine at home:**
- YouTube often blocks audio downloads from cloud servers. A home internet connection works.
- The beat and chord models need Python and PyTorch. Supabase Edge Functions can't run them.

**Options considered:**
- **GitHub Actions:** skipped. YouTube may block GitHub's servers, and you'd rather keep this at home.
- **Edison:** a poor fit. It routes work through an AI agent and pull requests.
- **Nvidia Shield (2017 and 2019 Pro):** possible through Termux, but experimental.
- **Desktop:** chosen. The analyser already runs on Windows.

---

## Part 1: Install the analyser on the desktop (about 15 minutes)

Run these in **PowerShell**.

**1. Install the tools.** Then close PowerShell and open a new window.
```powershell
winget install Git.Git
winget install GitHub.cli
winget install Python.Python.3.11
winget install OpenJS.NodeJS.LTS
```

**2. Sign in to GitHub as ZarleyLtd.** Choose GitHub.com → HTTPS → Login with a web browser.
```powershell
gh auth login
gh auth setup-git
```
If git is new on this machine, also run:
```powershell
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

**3. Download the app.**
```powershell
mkdir C:\CursorSites -Force
cd C:\CursorSites
gh repo clone ZarleyLtd/Stomper
cd Stomper\analyzer
```

**4. Create a separate Python environment and install the analyser.** This takes a few minutes because PyTorch is large.
```powershell
py -3.11 -m venv .venv
.venv\Scripts\python -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
.venv\Scripts\python -m pip install beat-this "yt-dlp[default]" librosa imageio-ffmpeg requests pyyaml mir_eval truststore
git clone --depth 1 https://github.com/jayg996/BTC-ISMIR19 vendor/BTC
```
If Avast is installed and pip fails with `CERTIFICATE_VERIFY_FAILED`, add this to both pip commands:
`--cert "C:\ProgramData\Avast Software\Avast\wscert.pem"`

**5. Test without publishing.** It should end with `done in …s`. The first run also downloads the beat model.
```powershell
.\analyze.bat --no-push dQw4w9WgXcQ
```

**6. Publish a real song.** It should end with "Published", and the song appears on the phone about a minute later.
```powershell
.\analyze.bat https://www.youtube.com/watch?v=<some video>
```

If you add songs from both the laptop and the desktop, run `git pull` in `C:\CursorSites\Stomper` before analysing. (To do: make `analyze.bat` pull first.)

## Part 2: Keep the desktop awake during set hours

**7. Check that wake timers are supported.**
```powershell
powercfg /a
```
You want "Standby (S3)" in the list. If it only lists "Standby (S0 Low Power Idle)", the PC uses Modern Standby and timed wake-ups may be unreliable. In that case, set sleep to **Never** in Settings → System → Power instead.

**8. Allow wake timers.**
```powershell
powercfg /setacvalueindex SCHEME_CURRENT SUB_SLEEP RTCWAKE 1
powercfg /setactive SCHEME_CURRENT
```

**9. Create the two schedules.** Run PowerShell **as Administrator**. This keeps the desktop awake from 9:00 to 23:00; change the times if you like.
```powershell
$wakeSettings = New-ScheduledTaskSettingsSet -WakeToRun -StartWhenAvailable
Register-ScheduledTask -TaskName "Stomper stay awake" -RunLevel Highest -Settings $wakeSettings `
  -Trigger (New-ScheduledTaskTrigger -Daily -At 9:00) `
  -Action (New-ScheduledTaskAction -Execute "powercfg.exe" -Argument "/change standby-timeout-ac 0")
Register-ScheduledTask -TaskName "Stomper allow sleep" -RunLevel Highest -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable) `
  -Trigger (New-ScheduledTaskTrigger -Daily -At 23:00) `
  -Action (New-ScheduledTaskAction -Execute "powercfg.exe" -Argument "/change standby-timeout-ac 30")
```
The desktop must be **asleep, not shut down**, for the 9:00 wake to work. Run `powercfg /waketimers` to see what will wake it. Test it by putting the PC to sleep shortly before one of the times.

**Other options, if needed:**
- A BIOS "Power on by RTC" setting, for one daily start.
- A smart plug plus the BIOS setting "Power on after AC power loss", to wake it on request.
- Wake-on-LAN sent from one of the Shields.

## Part 3: The automatic queue (to be built by Claude)

- **On the phone:** a "Request chords" button for songs that haven't been analysed. It adds the song to a queue.
- **On the desktop:** a background worker that starts at login. It checks the queue every 1–2 minutes, runs `git pull`, analyses new songs, publishes them and marks each request done.
- **Decision needed: where the queue lives.**
  - **GitHub issues** in this repo, as Edison does. The phone needs a GitHub token saved in the app.
  - **A small table in the shared Supabase "Apps" project.** There's no token on the phone. It needs a `stomper-api` Edge Function, set up with the shared-supabase skill.

**To resume:** finish Parts 1 and 2 on the desktop. Then tell Claude "build the Stomper queue" and say which queue you chose.
