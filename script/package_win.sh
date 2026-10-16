#!/bin/sh
# Package the bot for distribution on Windows

mkdir TriviaBot && \
cp ./CHANGELOG.md TriviaBot && \
cp ./config.example.json TriviaBot && \
cp ./package.json TriviaBot && \
cp ./index.js TriviaBot && \
cp ./install.bat TriviaBot && \
cp ./run.bat TriviaBot && \
cp ./profile.png TriviaBot && \
cp ./README.md TriviaBot && \
cp ./lib TriviaBot/lib -r && \
cp ./Questions TriviaBot/Questions -r
