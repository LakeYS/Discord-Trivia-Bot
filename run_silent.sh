#!/bin/sh
# Auto-restart (silent)
{
  echo "Launching... Use \"screen -r trivia\" to access the terminal and ctrl+a+d to exit the terminal."
  screen -dmS trivia ./run.sh
} || {
  read -p "Failed to launch, see log above. Please make sure that \"screen\" is installed on your system. Press enter to exit."
}
