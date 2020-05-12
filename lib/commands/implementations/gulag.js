const _ = require('lodash');
const moment = require('moment');
const parseDurationToSeconds = require('../../chat-utils/duration-parser');
const Command = require('../command-interface');
const CommandOutput = require('../command-output');
const { makeBan } = require('../../chat-utils/punishment-helpers');
const formatDuration = require('../../chat-utils/format-duration');

function isNormalInteger(str) {
  const n = Math.floor(Number(str));
  return n !== Infinity && String(n) === str && n >= 0;
}
let gulagStarted = false;
function gulag(defaultBanTime) {
  return (input, services, rawMessage) => {
    const [time, ...users] = input.split(' ');
    if (gulagStarted) {
      return new CommandOutput(
        null,
        'Gulag in progress. Please wait for the current vote to finish.',
      );
    }
    if (users.length > 5) {
      return new CommandOutput(null, 'Too many users to be sent to the gulag, max of 5.');
    }
    const timeParse = /((?:\d+[HMDSWwhmds])|(?:perm))?/;
    const timeDoesParse = timeParse.test(time);
    let isPermanent = false;
    let parsedDuration = 0;
    if (!timeDoesParse) {
      if (defaultBanTime === 'perm') {
        isPermanent = defaultBanTime === 'perm';
      } else {
        parsedDuration = parseDurationToSeconds(defaultBanTime);
      }
    } else {
      parsedDuration = parseDurationToSeconds(time);
    }
    const muteString = isPermanent
      ? 'PERMANENTLY'
      : formatDuration(moment.duration(parsedDuration, 'seconds'));
    gulagStarted = true;
    const listener = services.messageRelay.startListenerForChatMessages('gulag');
    if (listener === false) {
      return new CommandOutput(null, 'Something went wrong?? uhh. Restart me.');
    }
    const votedMap = {};
    const userVotes = users.map(name => ({ name, value: 0 }));
    listener.on('message', data => {
      if (votedMap[data.user]) {
        return;
      }
      const message = data.message.trim();
      if (isNormalInteger(message)) {
        const int = parseInt(message, 10);
        if (int >= 1 && int <= users.length) {
          votedMap[data.user] = true;
          userVotes[int - 1].value += 1;
        }
      }
    });
    setTimeout(() => {
      gulagStarted = false;
      services.messageRelay.stopRelay('gulag');
      services.messageRelay.sendOutputMessage('Total votes:');
      userVotes.forEach(user => {
        services.messageRelay.sendOutputMessage(`${user.name} votes: ${user.value}`);
      });
      const firstWinner = _.maxBy(userVotes, 'value');
      const winners = userVotes.filter(user => user.value === firstWinner.value);
      const losers = userVotes.filter(user => user.value !== firstWinner.value);
      winners.forEach(user => {
        services.messageRelay.sendOutputMessage(
          `${user.name} has won the most votes and will be released from the gulag AYAYA`,
        );
      });
      losers.forEach(user => {
        services.punishmentStream.write(
          makeBan(
            user.name,
            parsedDuration,
            false,
            isPermanent,
            `${user.name} banned through bot by GULAG battle started by ${rawMessage.user}. Votes: ${user.value}`,
          ),
        );
      });
    }, 30500);
    const userOrs = users.join(' or ');
    return new CommandOutput(
      null,
      `/vote ENTER THE GULAG. Chatters battling it out to not get ${muteString} ban. Vote KEEP not KICK!? ${userOrs} 30s`,
    );
  };
}
module.exports = {
  gulag: new Command(gulag(600), false, true, /((?:\d+[HMDSWwhmds])|(?:perm))\s.+/, null),
};