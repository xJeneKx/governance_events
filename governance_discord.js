const Discord = require('discord.js');
const conf = require('ocore/conf.js');

const DISCORD_SEND_RETRY_DELAY_MS = 5000;
const DISCORD_SEND_MAX_ATTEMPTS = 5;

var discordClient = null;

async function initDiscord(){
	if (!conf.discord_token)
		throw Error("discord_token missing in conf");
	if (!conf.discord_channels || !conf.discord_channels.length)
		throw Error("channels missing in conf");
	discordClient = new Discord.Client();
	discordClient.on('ready', () => {
		console.log(`Logged in Discord as ${discordClient.user.tag}!`);
	});
	discordClient.on('error', (error) => {
		console.error(`Discord error: ${error}`);
	});
	await discordClient.login(conf.discord_token);
	setBotActivity();
};
initDiscord();

const defaultSymbol = 'tokens';

function setBotActivity(prefix){
	prefix = prefix ? (prefix + " ") : "";
	discordClient.user.setActivity(prefix + "governance AAs" , {type: "WATCHING"});
}

function announceEvent(aa_name, symbol, decimals, url, event, fullExplorerURL){
	if (!fullExplorerURL) {
		fullExplorerURL = conf.explorer_base_url + event.trigger_unit;
	}

	const msg = new Discord.MessageEmbed().setColor('#0099ff');
	let description = '[View on interface](' + url+')\n\n' + event.trigger_address;

	function addLeaderValues() {
		msg.addFields(
			{ name: "Leader value", value: event.leader_value, inline: true },
			{ name: "Support", value: applyDecimals(event.leader_support, decimals) + ' ' + (symbol || defaultSymbol), inline: true},
			{ name: '\u200B', value: '\u200B' , inline: true 	}
		)
	}

	switch(event.type) {
		case "added_support":
			msg.setTitle('Support added in ' + aa_name)
			.setDescription(description + ' adds ' + applyDecimals(event.added_support, decimals) + ' ' + (symbol || defaultSymbol) + ' in support of value `' + event.value +'` of parameter `'+event.name +'`'
			)
			.addFields(
				{ name: "Value", value: event.value, inline: true },
				{ name: "Support", value: applyDecimals(event.support, decimals) + ' ' + (symbol || defaultSymbol), inline: true},
				{ name: '\u200B', value: '\u200B' , inline: true 	}
			)
			addLeaderValues();
			break;
		case "removed_support":
			msg.setTitle('Support removed in ' + aa_name)
			.setDescription(description + ' removes its vote on parameter `' + event.name + '`')
			addLeaderValues();
			break;
		case "commit":
			msg.setTitle('New value committed in ' + aa_name)
			.setDescription(description + ' has committed value `' + event.value+ '` for parameter `' + event.name + "`")
			.addFields(
				{ name: "Parameter", value: event.name, inline: true },
				{ name: "Value", value: event.value, inline: true},
				{ name: '\u200B', value: '\u200B' , inline: true 	}
			)
			break;
		case "deposit":
			msg.setTitle('Balance added to ' + aa_name)
				.setDescription(description + ' has added `' + applyDecimals(event.amount, decimals) + ' ' + (symbol || defaultSymbol) + '` to their governance balance')
			break;
		case "withdraw":
			msg.setTitle('Balance withdrawn from ' + aa_name)
			.setDescription(description + ' has withdrawn `' + applyDecimals(event.amount, decimals) + ' ' + (symbol || defaultSymbol) + '` from their balance')
			break;
	}

	const formattedTimestamp = formatTimestamp(event.timestamp);
	if (formattedTimestamp)
		msg.addFields({ name: 'Date', value: formattedTimestamp });

	msg.addFields({name: 'Trigger unit', value: '[' + event.trigger_unit + ']('+ fullExplorerURL +')'});
	sendToDiscord(msg);
}

function wait(ms){
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendToDiscordChannels(to_be_sent, attempt){
	await Promise.all(conf.discord_channels.map(async function(channelId){
		console.log(`Sending Discord notification to channel ${channelId}, attempt ${attempt}/${DISCORD_SEND_MAX_ATTEMPTS}`);
		const channel = await discordClient.channels.fetch(channelId);
		await channel.send(to_be_sent);
		console.log(`Discord notification sent to channel ${channelId}`);
	}));
}

async function sendToDiscordWithRetry(to_be_sent){
	let lastError = null;
	for (let attempt = 1; attempt <= DISCORD_SEND_MAX_ATTEMPTS; attempt++) {
		try {
			await sendToDiscordChannels(to_be_sent, attempt);
			return;
		} catch (error) {
			lastError = error;
			console.error(`Discord notification attempt ${attempt}/${DISCORD_SEND_MAX_ATTEMPTS} failed: ${error.message || error}`);
			if (attempt < DISCORD_SEND_MAX_ATTEMPTS)
				await wait(DISCORD_SEND_RETRY_DELAY_MS);
		}
	}
	throw lastError;
}

function sendToDiscord(to_be_sent){
	if (!discordClient) {
		console.error("discord client not initialized");
		process.exit(1);
	}
	if (process.env.mute)
		return console.log("client muted");
	sendToDiscordWithRetry(to_be_sent).catch(function(error){
		console.error(`Discord notification failed after ${DISCORD_SEND_MAX_ATTEMPTS} attempts: ${error.message || error}`);
		process.exit(1);
	});
}

function applyDecimals(amount, decimals){
	if (!amount)
		return 0;
	return amount / (10 ** decimals);
}

function formatTimestamp(timestamp) {
	const normalizedTimestamp = Number(timestamp);
	if (!Number.isFinite(normalizedTimestamp) || normalizedTimestamp <= 0)
		return null;

	const date = new Date(Math.floor(normalizedTimestamp) * 1000);
	if (Number.isNaN(date.getTime()))
		return null;

	return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
}

exports.setBotActivity = setBotActivity;
exports.announceEvent = announceEvent;
