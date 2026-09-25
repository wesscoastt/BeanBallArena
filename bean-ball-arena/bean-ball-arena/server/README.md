# Playing online with friends

Online rooms need the game server running on the internet. The easiest free option is **Render**.

## One-time setup (about 5 minutes)
1. Put this whole `bean-ball-arena` folder in a GitHub repo (the same way you do for GitHub Pages).
2. Go to **render.com**, sign in with GitHub.
3. Click **New +** → **Blueprint**, pick the repo, click **Apply**.
   (It reads `render.yaml` in the repo, so there's nothing to fill in.)
4. Wait for it to say **Live**. Your game is at the address it shows, like
   `https://bean-ball-arena.onrender.com`

## Playing
1. Open your Render address, then **CREATE PRIVATE MATCH**. You get a code like `K7P4Q`.
2. Tap **COPY INVITE LINK** and send it (Snapchat, text, whatever). Friends can also open the address and type the code into **JOIN PRIVATE MATCH**.
3. Everyone hits **READY**. You (the host) can add or remove bots or leave **auto-fill bots** on, change match settings, then hit **START MATCH**.

## Good to know
- Render's free plan goes to sleep when nobody's playing. The first visit after a while takes about a minute to wake up. After that it's instant.
- If someone's connection drops, a bot plays for them. They get 45 seconds to come back, and just reopening the page puts them back in their seat.
- Max 6 real players per room. Bots fill the rest.
- The version inside Claude and GitHub Pages can't do online play. Use the Render address for that.

## Running it on your own computer
```
npm install
npm start
```
Then open http://localhost:3000. Friends on the same Wi-Fi can use `http://YOUR-PC-IP:3000`.
Add `?lag=120` to the address to fake a laggy connection for testing.
