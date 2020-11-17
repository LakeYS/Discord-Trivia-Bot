#!/bin/sh
# Package the bot for distribution on Linux

mkdir TriviaBot
cp config.json TriviaBot
cp package.json TriviaBot
cp triviabot.js TriviaBot
cp index.js TriviaBot
cp shard.js TriviaBot
cp run.sh TriviaBot
cp run_silent.sh TriviaBot
cp profile.png TriviaBot
cp README.md TriviaBot
cp lib TriviaBot/lib -r
cp Questions TriviaBot/Questions -r
tar -zcvf triviabot.tar.gz TriviaBot
