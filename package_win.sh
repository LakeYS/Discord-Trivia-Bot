#!/bin/sh
# Package the bot for distribution on Windows

mkdir TriviaBot
cp config.json TriviaBot
cp package.json TriviaBot
cp triviabot.js TriviaBot
cp index.js TriviaBot
cp shard.js TriviaBot
cp install.bat TriviaBot
cp run.bat TriviaBot
cp profile.png TriviaBot
cp README.md TriviaBot
cp run_silent.vbs TriviaBot
cp lib TriviaBot/lib -r
cp Questions TriviaBot/Questions -r
