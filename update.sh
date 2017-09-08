# This auto-updates the bot to the latest version on GitHub.
# Note that this updates to the unstable version, not the latest release.
# TODO: Create a windows equivalent of this?
curl -L -O https://github.com/lakeys/discord-trivia-bot/archive/master.tar.gz
tar -xzf master.tar.gz
rm master.tar.gz
rm Discord-Trivia-Bot-master/config.json
mv Discord-Trivia-Bot-master/* ./
rm -r Discord-Trivia-Bot-master
npm install
chmod +x run.sh
