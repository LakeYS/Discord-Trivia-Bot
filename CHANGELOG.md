# Changelog

## v1.8.7 - Message intent fix, channel whitelist fix - 2025-03-29
* Fixed issues with the bot ignoring messages due to missing intent.
* Fixed the 'channel-whitelist' config option breaking if the same channel name is used in multiple servers.
* Updated dependencies.

## v1.8.6 - Hotfix 9/2/2023  2023-09-02
* Updated discord.js from 13.2.0 to 14.13.0.
* Added a new config option, `categories-in-channel`. When enabled, typing 'trivia categories' lists the categories in the channel instead of the user's DMs.

## v1.8.5 - Hotfix 12/15/2021 - 2021-12-15
### What's New
* Fixed unexpected game endings related to Discord interactions.

### Changes for self-hosted instances
+ Game timers now display in hours if the timer is longer than one hour. For example, "The answer will be revealed in x hours" instead of minutes.
* Fixed "Unknown interaction" errors disrupting the bot. Now displays a warning in console, "Failed to reply" or "Failed to update".

## v1.8.4 - Nickname Abuse Fix - 2021-10-14
### What's New
* Improved filtering to prevent usernames and nicknames from inserting formatting and links into game messages.

### Changes for self-hosted instances
* Fixed improper handling for missing components. Now displays an error, "Failed to retrieve component..."
* "Received late response" errors now log additional relevant information.
* Added engines field to package.json, indicating the required version of node.js (16.6.0 or higher).
* Updated discord.js to 13.1.0.

## v1.8.3 - Buttons Hotfix - 2021-08-19
### What's New
* Answer buttons now cut off with "..." if an answer is greater than 80 characters in length.
* Fixed games stopping abruptly with either no error or "components[0].components[x].label: Must be 80 or fewer in length"

### Changes for self-hosted instances
+ File database now enforces an 80 character limit for answers unless `hangman-mode` and/or `allow-long-answers` are enabled. This follows Discord's limit of 80 characters per button.

## v1.8.2 - More Buttons - 2021-08-18
### What's New
+ When a round ends, the button corresponding to the correct answer now changes color.
+ Buttons now become greyed out at the end of the round.
+ The `trivia help` command now uses link buttons, replacing the text-based links within the response.
+ `trivia ping`

### Changes for self-hosted instances
* Fixed potential errors related to stat recording (stats.json) knocking the bot offline -- Now writes a warning in the console instead.

## v1.8.1 - Hotfix - 2021-08-10
### What's New
+ Default round lengths have been updated to accommodate buttons. Rounds are now five seconds shorter and have a slightly shorter wait between rounds. (15 second rounds, 4 seconds in between)

### Changes for self-hosted instances
* Updated discord.js to 13.0.1.
* Fixed console commands resulting in errors.
* Typing "exit" into the console now properly logs out from Discord, rather than leaving the bot online for several minutes.
* Sharding manager now always automatically restarts the bot.

## v1.8 - Buttons - 2021-08-09
![image](https://user-images.githubusercontent.com/13769484/128652274-bcda81e2-f193-4702-ba17-17229d0a2b3c.png)

### What's new
+ Games now use buttons. Answers are accepted by button press rather than a typed answer. The new buttons are ideal for more serious competitions, as players can no-longer snoop on answers.
+ The classic typed-answer mode is still accessible via `trivia play advanced`.
+ Existing pre-made `trivia play advanced` commands may no-longer work as expected.
+ Advanced game command strings are no-longer enclosed in quotation marks, for easier copying.
+ Added a warning message to `trivia play hangman`. (Some questions not suited for hangman style gameplay)

**Note: With the new buttons mode, reaction mode is planned to be removed in a future update.**

### Changes for self-hosted instances
* Added additional logging when a message fails to send.

**This update requires Node.js 16.6 or higher. Check "Setting up the bot" under the [install instructions](https://lakeys.net/triviabot/install.html) for your OS.**

**Reactions mode is planned to be removed in a future update. Please plan accordingly if you rely on reaction mode.**

## v1.7 - Command Improvements - 2021-07-20
### What's New
+ Added a new command: `trivia play hangman`. This command can be used to start hangman games more easily, without needing to go through advanced game setup.
+ The help command has been re-worked for readability.
+ The "trivia ping" command has been removed -- it has been absorbed by "trivia help". You can now see shard and response information on the help command footer.
+ Permissions errors no-longer ask for the defunct "Read messages" permission.
* Fixed admins only being able to forcibly cancel advanced game setup by typing "trivia stop". Typing "cancel" now works as well.

### Changes for self-hosted instances
- Bot listing tokens have been moved to their own section in config, and now have a toggle named enable-listings.
- Added new config option, `stat-guild-recording`. This option records to stats.json when guilds are created/deleted for the bot.
* Fixed error handling for when a token has not yet been provided -- now displays the intended messages.
* Fixed "Failed to delete player answer: Cannot execute action on a DM channel" errors in DM games with auto deletion.
* Fixed `reveal-answers` config option defaulting to false if not specified in config

For more information on how to set up the new question parameters, see "Optional Configurations for Custom Questions" in the install guide: https://lakeys.net/triviabot/install.html#customQuestionsOptionals

## v1.6.7 - Config Hotfix - 2021-06-25
* Removed old bot listing websites from the config file.
* Fixed rounds running endlessly if `use-fixed-rounds` is not defined in config. (i.e. if you've imported config from an old version of the bot)

## v1.6.6 - Cumulative Update for 2021 - 2021-06-23
**NOTE:** Make sure to update to the latest version of Node.js LTS to install this update. See the install instructions for more info:
[How to Install](https://lakeys.net/triviabot/install.html)

### What's New
+ Reworded "Game will end" warnings for clarity -- now reads "Game will end in (x) rounds if there is no activity".
+ Updated answer sorting to properly account for answers that use diacritics.
+ Hangman game hints at the start of the game now start with "Hint:" for clarity.
* Fixed hangman games being shorter than intended.
* Fixed broken formatting in questions that contain underscores.

### Changes for self-hosted instances
+ Updated discord.js to 12.5.2
+ Config and question files are now named `*.json.example` so that they are less likely to be overwritten by accident.
+ The sample database question files now use quotes, as this is a more ideal solution in case special characters are required in YAML. See here: https://github.com/LakeYS/Discord-Trivia-Bot/tree/master/Questions
+ Added the `hangman-hints` option to enable or disable hangman hints.
+ Added the `reveal-answers` option to toggle whether answers are revealed at the end of a round.
+ Fixed numbers of rounds can now be set using `use-fixed-rounds` and `rounds-fixed-number` in config.
+ The shard process(es) now change their title to indicate when they are still initializing. (Example: `Trivia - Shard 0 (Initializing)`)
+ In debug mode, "Token" now reads "DB Token" instead for additional clarification.
+ The console will now display the disconnect code and reason (if applicable) when the Discord client disconnects.
+ The ASCII logo display is now disabled by default. It can be optionally re-enabled in config using the `display-ascii-logo` option.
+ Updated error messages in loading the config file to be more easily readable.
+ Added additional clarification for error messages in the file database when the "difficulty" field is specified incorrectly.

## v1.6.5 - Cumulative Update for 2020 - 2020-05-25
### What's New
+ Updated to discord.js 11.6.2.
+ Updated `trivia play <category>` to identify category names more intelligently. Categories and inputs with or without ":" symbols or "&"/"and" are now recognized interchangeably. 
* Fixed mysterious extra spaces in the "trivia help" command that only show up on certain mobile versions of Discord.
* Fixed the bot not detecting when it is @-mentioned for help.
* Revised the connection error message for 'trivia categories'

### Changes for self-hosted bots
+ Added additional warnings for the file database when questions are entered incorrectly. This should help narrow down erroneous questions on startup.
+ File database now detects if the "questions:" header is missing and displays an error accordingly.
+ Added a retry limit and an adjusted message cache size for the Discord client. This may help reduce memory usage of the application.
* Shards now display a console message on death, disconnect, and reconnect.
* Added a warning when shards close with a null exit code.
* Added extra logging when the client disconnects.
* "Failed to send message to channel. (no user)" errors now dump message data.
* "Failed to send message to user [user]. (DM failed)" errors now dump message data.
* Fixed "trivia ping" occasionally spawning an error if the message does not send.
* "debug-log" now shows user IDs instead of names in scoring logs.

## v1.6.4 - Hotfix for repeating questions - 2019-07-01
* Fixed file question database showing repeating questions in certain configurations.
* File question database now exits with an error if the same category ID is referenced more than once.
* Updated console messages for file database handling.
* Renamed lib/evalCmds.js to eval_cmds.js

## v1.6.3 - Config Error Hotfix - 2019-06-27
* Fixed "Cannot read property 'length' of undefined" errors related to the "command-whitelist" config option.

## v1.6.2 - 2019-06-19
### What's New
* Fixed answers not being accepted when using reaction mode in a direct message.
* Fixed error when using "trivia play advanced" parameters and leaving out the channel.

### Server-Side Changes
+ Users whitelisted under the "command-whitelist" option are now treated as moderators, regardless of their roles.
+ Updated the example question database to work better with hangman games.
+ Revamped messages that show up when posting to bot listing websites.
* Fixed advanced games not retaining their game-mode if another mode is enabled in config.json.
* Updated js-yaml to 3.13.1
* Updated discord.js to 11.5.1

## v1.6.1 - Advanced Games Hotfix - 2019-03-08
* Fixed advanced games not automatically ending when players don't participate.

## v1.6 - The Advanced Games Update - 2019-03-08
### What's New
+ Advanced games! This is a brand new feature that lets you start a customized game. With advanced games, you can specify the mode of play, question difficulty, question type, and channel that the game will start in. Advanced games have a handful of brand new modes to play in, with more coming soon!
+ Hangman-style games! Hangman mode can be activated by starting an advanced game.
+ Reaction mode! This is a mode that uses reactions instead of typed answers. It can be activated by starting an advanced game.
+ Updated line spacing for the "trivia help" command.
+ Scores are now formatted properly (For example, "1,000" instead of "1000")
+ The "trivia stop" command can now stop games in other channels by typing "trivia stop #channel"
* "Missing Access" and "Missing Permissions" errors now display a more descriptive error messages.

### Server-Side Changes
+ The bot now detects the termination signal on Linux systems and exits cleanly. This reduces the potential for unexpected side effects when running the bot as a service or using other external process management.
+ Added config option "auto-delete-answers" - The bot will automatically delete players' typed answers when enabled. Does nothing if reaction mode is turned on. Bot must have the "manage messages" permission enabled in order to use.
+ Added the config option "auto-delete-answers-timer" - This works with the above config option, allowing a time to be set for how long before answers are deleted. Time is in milliseconds, with 0 being as quickly as possible. Timer accuracy will vary based on network latency.
+ Added the config option "embed-color" - This changes the color of the bot's responses from its default blue color. Colors are accepted in the form of [hex codes](https://stackoverflow.com/questions/22239803/how-does-hexadecimal-color-work).
+ Added the config option "hangman-mode" - This forces hangman mode to be enabled by default, without the use of advanced games.
+ Added the config option "channel-whitelist" - If any channels are specified, the bot will only work in those channels. Can specify either a channel name or an ID. Example: `"channel-whitelist": [ "trivia-dev", "trivia-dev2", "261705677943209984" ]`
+ Added the config option "config-commands-enabled" - Enables commands that allow for configuring the bot. See the documentation for more information: https://LakeYS.net/triviabot/install.html#commandConfig
+ Added the config option "score-multiplier-max" - Allows for setting a bonus multiplier for questions. Bonuses are given based on how many other players get the question incorrect. Recommended
* Fixed the "command-whitelist" option not working correctly if there are multiple users on the whitelist.
* Fixed the bot ignoring the "prefix" option in certain messages.
* Windows install.bat no-longer calls "npm update".
* Config warnings now show below the ASCII art instead of above it.
* Removed the unused "additional-config-passthrough" and "additional-manager-passthrough" options.
* Reworked the "additional-packages" option.

**NOTICE: Before installing this update, it is recommended that you update Node.js to the latest LTS version on your system.**

## v1.5.3 - Bot Listing Fixes - 2018-12-11
### What's New
* Fixed "trivia play advanced" showing up under the command list. (It is work-in-progress feature that is not available yet)

### Server-Side Changes
+ Bot now logs when it posts to listing websites
+ Added support for discord.bots.gg
+ Responses are now shown when posting to listings
+ Listing errors now display the response
* Removed the unused bots.discord.pw API
* Removed the unused listcord API
* Removed the unused discordbots.co.uk API
* Fixed support for discordbots.group
* Fixed listing errors showing the wrong site name
* Fixed error when posting to botsfordiscord.com


## v1.5.2 - Scoring and Custom Question Bugfixes - 2018-11-27
### What's New
* Fixed scores changing to "N/A" and resetting to 0.

### Server-Side Changes
* Custom question database now errors out when a question does not have a valid difficulty level specified. This fixes several possible instances of the N/A bug and the "Cannot read property 'toString' of undefined" error.
* [e7af8a5] Fixed "Cannot read property 'toString' of undefined" causing the bot to stop without warning.
* [5c2cbfa] Database query errors now log more detailed information in the console.
* [d4770d5] YAML syntax errors (as well as other init errors) no-longer flood the console with raw data, making the errors much more human-readable.


## v1.5.1 - Custom Database Fixes - 2018-11-27
### What's New
+ The bot now notifies when a game is about to automatically end. ("Game will end in x rounds if nobody participates")

### Server-Side Changes
+ Added config option: `database-merge`. For use while using a custom file database, this option allows the use of both custom questions and OpenTDB questions at the same time.
+ Added config option: `round-end-warnings-disabled`, disables the "game will end if nobody participates" warnings.
+ Added config option: `command-whitelist`, allows for setting a whitelist of users that are can use commands.
* Fixed custom DB questions with numbers as answers showing up blank.
* Typing "npm start" now works in the bot's directory.
* Added comments to the default file database.
* Fixed console reading "File database loaded" when an error occurs.
* File database errors now indicate which file caused the error.

See the [Config Documentation](http://lakeys.net/triviabot/install.html#useConfig) for more information on the new configuration options.

## v1.5 - 2018-11-09
![profile_2-1 5](https://user-images.githubusercontent.com/13769484/48174248-3df24880-e2d5-11e8-9978-4611f78a5eb0.png)

### New in 1.5
+ Added a new command: `trivia ping`. This comand allows users to test the latency of the bot,
* [aa4ad3a] Fixed game breaking if there are too many players. Score lists now only show up to 32 players to prevent the bot from exceeding Discord's character limit.
* [959fb65] Fixed game scoreboard reading plural "final scores" with only one score when game is force-ended between rounds.

### Server-Side Changes
+ You can now create your own custom question sets! See here for instructions: http://lakeys.net/triviabot/install.html#customQuestions
+ At long last, the "Eval on index" issue has been fixed. The "allow-eval" option is now set to true by default.
+ Added config option: `full-score-display`. This option forces the bot to display the full scoreboard between each round, rather than the "condensed" version that shows only changed scores.
+ Uses of "trivia help", "trivia categories", "trivia stop" and "trivia ping" are now logged in stats.json.
+ Custom category rounds now log which category is used in stats.json.
+ Refactored game data to use less arrays.
+ Updated discord.js to 11.4.2
+ Updated circular-json to 0.5.9
* [f97a949] The bot now exports games when a Discord client error occurs. This reduces cases of games stopping suddenly when an error occurs.

**WARNING: Do not use the export command to carry game data over to this version.**

## v1.4.2 - Critical Scoring Fix - 2018-09-01
**Warning: The commit and source code files that are tagged with this release do not properly reflect the changes made in it.**

* [49cbe31] Fixed scores being counted between rounds.

## v1.4.1 - Score Display Fix - 2018-07-24
[cc2064a] The final scores now display when an admin types 'trivia stop' between rounds

## v1.4 - 2018-07-21
![profile_2-1 4](https://user-images.githubusercontent.com/13769484/43039098-2ceda886-8cf4-11e8-9e36-1c949196dd82.png)

### New in 1.4
+ Trivia games now use a scoring system. Rounds are scored are based on question difficulty; when a game ends, everyone's final scores are displayed.
+ Players can now change their answer in a game. (The last answer given is accepted instead of the first)
+ Trivia games now show players' nicknames for the guild (if they have one) instead of their usernames.
+ Trivia games now read "Incorrect, (name)!" instead of "Correct answers: Nobody!" when only one user is playing.
* [9191d00] Fixed the "Failed to generate a session token for this channel." error displaying repeatedly when a token cannot be generated.

### Server-Side Changes
+ Added listing support for botsfordiscord.com, discordbot.world, and listcord.com. Use the following config options:  `botsfordiscord.com-token`, `discordbot.world-token`, `listcord.com-token`
+ A warning now displays if an invalid string (such as a client secret, etc.) has been entered as a token.
+ DM games are no-longer excluded from failover.
+ JSON parsing errors now log the input.
+ Added several new config options for configuring custom scripts and beta mode features.
+ The terminal now reads "TriviaBot Beta [version]" when in beta mode.
+ Added console command: `exportexit`
+ Updated circular-json to 0.5.5
* [c545e22] Fixed format of .sh files. This should fix issues with launching the bot on Linux systems.
* [eadf1b4] Fixed the "trivia stop" warning message not adjusting when `rounds-end-after` is updated in config.
* [5276ac2] Fixed "trivia help" not adjusting properly when `databaseURL` is updated in config.
* [362997d] Fixed the "allow-eval" option not working correctly. This allowed for a wide variety of issues on certain systems.

**WARNING: DO NOT use exports to carry game data from previous versions to this update.**

## v1.3 - 2018-05-20
![Profile Picture](https://user-images.githubusercontent.com/13769484/40252292-ed0d7e70-5aa9-11e8-841a-56b7a4514a48.png)
### New in v1.3
+ The "trivia stop" and "trivia cancel" commands now cancel the game when typed by an administrator.
+ The amount of time users have to answer is now displayed at the start of a game.
+ Trivia games now end after two rounds of inactivity rather than one.
+ Trivia games now last 20 seconds instead of 25. This is to compensate for the previous change.
+ Bot now writes "Game ended." when a game ends.
+ The "trivia play" command no-longer attempts to match single-letter category queries.
+ The guild and question counts in the 'trivia help' command are now formatted with commas.
+ Typing "trivia help" now displays the active version of discord.js.
* [7abc3ca] Fixed "trivia play" responding with an error when extra letters are added after "play" (e.g. "trivia playy")
* [01c5ca6] Fixed "trivia stop" or "trivia admin cancel" displaying a warning message when there is no game running.
* [d7f6b13] Fixed "trivia stop" not working in DMs.

### Server-Side Changes
+ Failover system now works even when the shard count changes.
+ Added config option: `auto-delete-msgs`.
+ Added config option: `rounds-end-after`. This configures how many inactive rounds are allowed before a game ends. This is set to 2 by default; for behavior identical to previous versions, set this to 1.
+ Updated circular-json to v0.5.4.
* [2e87a2c] Fixed 'exit' command only working on index in the console.
* [71d0e12] Fixed "Error occurred while posting to bots.discord.pw" displaying twice in the console.

## v1.2 - 2018-04-03
![Logo](https://user-images.githubusercontent.com/13769484/37866359-0a8d93a6-2f60-11e8-82a7-3c4d55c4a688.png)

### New in v1.2
+ The 'trivia help' command has been overhauled with better performance and rich embeds.
+ The 'trivia categories' command now shows question counts for each category.
+ The bot now internally records some global statistics about trivia games. These statistics will be viewable via command in a later update.
+ The 'trivia help' and 'trivia categories' commands now respond faster.
+ Round timers have been increased from 15 seconds to 25 seconds.
* [d0fa2dd] Revamped the bot's permission check system. This should prevent the bot from breaking in rare instances where permissions are not interpreted correctly.
* [3c76891] Active trivia games now automatically save and reload when an internal error occurs to prevent the game from getting interrupted.
* [df50c1f] Fixed bot getting stuck in a loop in rare cases when the database fails to return a new token.
* [f1b1b7c] Fixed 'trivia categories' not displaying error messages properly.
* [add1cb8] Fixed games' timers occasionally becoming out of sync with messages. (e.g. ending before the answer message would display)
* [07006d9] Fixed repeating "Failed to query the trivia database with error code 3" errors.
* [4f7b9a8] Fixed "Unable to find the category you specified" error displaying when a game is already in progress.

### Server-Side Changes
+ Added internal config option: `allow-eval`. This is disabled by default as a workaround for cases when "Eval on index:" displays in the console and the bot never connects.
+ Game data can now be saved to the disk easily using the following console commands: `export`, `import`, `exportall`, `importall`. This allows for maintenance and reboots without disrupting active games. Note that this requires `allow-eval` to be enabled.
+ Added internal config option: `databaseURL`
+ Added internal config option: `database-cache-size`
+ Updated snekfetch package to 3.6.4
+ Updated discord.js to 11.3.2
* [271b142] Fixed "Discord global.client error: 'undefined"

## v1.1.4 - Hotfix for run.sh - 2018-02-27
* [0684090] Fixed bot failing to launch on Linux-based systems.

## v1.1.3 - 2018-01-30
+ Added `shard-count` config option.

* [1b3a6e6] Fixed duplicate trivia questions in custom category games.
* [9c338e3] Fixed "Error: Cannot find module 'snekfetch'"
* [ce409d2] Fixed crash when typing 'trivia help'
* [1bab4cf] Fixed vague error message when the client fails to log in.

## v1.1.2 - JSON Parsing Hotfix (Part 2) - 2018-01-19
* [73e26c6] Fixed crash while attempting to retrieve category list.
* [a876eb5] Fixed crash when starting a trivia game or entering 'trivia categories'.

## v1.1.1 - 'Unexpected end of JSON input' Hotfix - 2018-01-16
[0e8c99c] Fixed crash when attempting to initialize the category cache.

## v1.1 - Sharding and Custom Categories - 2018-01-16
+ Users can now specify a category when entering the 'trivia play' command.
+ Questions are now cached, meaning that games will start much faster! This also prevents the bot from flooding the database with requests.
+ Console formatting has been overhauled, introducing logo artwork and text coloring.
+ The bot now utilizes sharding.
+ Round results now display when 'trivia admin cancel' is entered.
+ Added config option: `use-reactions`. This is an optional setting that makes trivia games use reactions rather than typed responses. Currently, this can only be set globally in config.json.
+ Added config option: `allow-bots`
+ Added config option: `prefix`
+ Error messages are now more organized and descriptive.

* [ae3720a] run.bat no-longer waits five seconds on first startup. 
* [52945ac] Fixed the bot accepting trivia commands from other bots. (Can be toggled on or off in config.json)
* [b060659] Fixed 'trivia admin cancel' not working when entered between rounds.
* [94173bd] The bot now checks for the required permissions before starting a game.
* [198f9c1] Fixed broken game state preventing users from starting new games.
* [6ae7d1d] Fixed games not clearing correctly when errors occur or 'trivia admin cancel' is typed.
* [f25ff0bc] Fixed bot attempting to message itself rather than the user in certain error scenarios.
* [7c3b55a] Fixed certain players being able to enter multiple answers in the same round.
* [8e82267] Fixed responsive answer display not working correctly. (Games now adapt better to higher player counts)

## v1.0 - Initial Release - 2017-11-20
This marks the official release of the bot. With this release comes an improved website and instructions for how to manually host the bot, found at http://lakeys.net/triviabot/install.html

Here are the highlights of what is currently implemented:
- Access to a complete database of over 2,500 categorized, multiple-choice trivia questions. (Thanks to OpenTDB)
- Works across simultaneous channels and Discord servers. (For example, large servers can have multiple trivia channels)
- Color-coded and categorized questions of varying difficulty.
- A scalable game system that adapts to the player count.
- Single-player trivia games via DM.

