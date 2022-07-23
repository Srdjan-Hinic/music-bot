const { prefix, token } = require("./config.json"); // token, prefix
const Discord = require("discord.js");
const ytdl = require("ytdl-core");
const yts = require("yt-search");
const ytpl = require('ytpl');
const colors = require('colors');
const fs = require('fs');
const pbar = require('string-progressbar');

const client = new Discord.Client();
const serverMap = new Map(); // map of all servers and their queues


client.once("ready", () => {
    console.log("Ready!");
});

client.once("reconnecting", () => {
    console.log("Reconnecting!");
});

client.once("disconnect", () => {
    console.log("Disconnect!");
});

client.on("message", async message => {
    if (message.author.bot || message.author.id == "342186053970427904" /*bjuko id*/ ) return; //ignore own messages, and bjuko
    if (!message.content.startsWith(prefix)) return; //ignore messages that dont start with the prefix 
    const serverQueue = serverMap.get(message.guild.id); //check if this server already has a queue

    if (message.content.startsWith(`${prefix}play`) || message.content.startsWith(`${prefix}PLAY`) || message.content.startsWith(`${prefix}p`) || message.content.startsWith(`${prefix}P`)) { //play song
        execute(message, serverQueue);
        return;
    } else if (message.content.startsWith(`${prefix}skip`)) { //skip song
        skip(message, serverQueue);
        return;
    } else if (message.content.startsWith(`${prefix}stop`)) { //stop everything
        stop(message, serverQueue);
        return;
    } else if (message.content.startsWith(`${prefix}radio`)) {
        try {
            const voiceChannel = message.member.voice.channel;
            var connection = await voiceChannel.join();
            //connection.play(`http://edge-rs-01.maksnet.tv/asmedia/index/playlist.m3u8`); // radio S2
            connection.play(`http://tx-bauerse.sharp-stream.com/http_live.php?i=rockklassiker_instream_se_mp3`); //rockklassiker
        } catch (e) {
            console.log(e);
        }
    }
    // clear queue and disconnect
    else if (message.content.startsWith(`${prefix}reboot`)) { // clear queue and disconnect
        serverQueue.isLooping = false;
        serverMap.delete(message.guild.id);
        message.channel.send("POZ BURAAAAZ");
        serverQueue.voiceChannel.leave();

        return;
    } else if (message.content.startsWith(`${prefix}queue`)) { // print queue

        if (!serverQueue) {
            return message.channel.send("There are no songs in the queue!");

        } else {
            try {
                const embed = new Discord.MessageEmbed(); // display queue as embed (scuffed) - TODO: MAKE IT PRETTIER
                embed.addField("Songs in the queue:", "_");
                let i = 0;
                serverQueue.songs.forEach(song => {
                    embed.addField(++i, `[${song.title}](${song.url})`);
                });
                serverQueue.textChannel.send(embed);
                return;
            } catch (e) {
                console.log(e);
            }
        }

    } else if (message.content.startsWith(`${prefix}qremove`)) {
        if (!serverQueue) {
            return message.channel.send("There are no songs in the queue!");
        }
        const args = message.content.split(" ");
        try {
            index = parseInt(args[1]) - 1;
            userIndex = index + 1;
        } catch (e) {
            console.error();
            return message.channel.send("Queue remove failed. You must pass the number of the song in the playlist! Type **!queue** to see the queue.")
        }
        queueLength = serverQueue.songs.length;
        if (index > queueLength) {
            return message.channel.send("There is no song at index " + `${userIndex}` + ".");
        } else {
            message.channel.send(`${serverQueue.songs.title}` + " has been removed from the queue.");
            serverQueue.songs.splice(index, 1);
        }

    } else if (message.content.startsWith(`${prefix}clearqueue`)) {
        if (!serverQueue) {
            return message.channel.send("There are no songs in the queue!");
        } else {
            while (serverQueue.songs.length > 1) {
                serverQueue.songs.pop();
            }
            return message.channel.send("The queue has been cleared");
        }

    } else if (message.content.startsWith(`${prefix}np`)) {


        try { //try to embed now playing on discord
            const embed = new Discord.MessageEmbed();
            embed.addField("Now playing: ", `[${serverQueue.songs[0].title}](${serverQueue.songs[0].url})`);
            pbar.splitBar
            serverQueue.textChannel.send(embed);
        } catch (e) {
            console.log(e);
            return message.channel.send("Nothing is currently being played.");
        }

    } else if (message.content.startsWith(`${prefix}loop`)) {
        serverQueue.isLooping = !serverQueue.isLooping;
        message.channel.send(`Lopping = ${serverQueue.isLooping}`);
    } else if (message.content.startsWith(`${prefix}commands`)) {
        message.channel.send(
            new Discord.MessageEmbed()
            .addFields({ name: "**!play**", value: "Plays a song from youtube or playlist from youtube. Valid arguments are keywords, direct links or playlist links" }, { name: "**!stop**", value: "Stops the currently playing song, clears the queue, leaves the channel" }, { name: "**!skip**", value: "Skips a song" }, { name: "**!queue**", value: "Displays the queue" }, { name: "**!clearqueue**", value: "Clears the queue" }, { name: "**!reboot**", value: "Stops everything, clears everything, a reboot switch pretty much" })
        );
    } else {
        message.channel.send("You need to enter a valid command, type !commands to get a list of commands.");
    }
});

async function execute(message, serverQueue) {
    const args = message.content.split(" ");
    const voiceChannel = message.member.voice.channel;
    let playListArr = new Array();
    let itemCount = undefined;
    let isPlaylist = false;

    if (!voiceChannel) //check if user is in a voice channel
        return message.channel.send(
        "You need to be in a voice channel to play music!"
    );
    const permissions = voiceChannel.permissionsFor(message.client.user);
    if (!permissions.has("CONNECT") || !permissions.has("SPEAK")) { //speak and connect permission check
        return message.channel.send(
            "I need the permissions to join and speak in your voice channel!"
        );
    }


    try {
        //check out if ytpl returns a playlist
        const data = await ytpl(args[1]);
        if (data != null) {
            isPlaylist = true;
            itemCount = data.estimatedItemCount;
            data.items.forEach(item => {

                playListArr.push({ //create temp array
                    title: item.title,
                    url: item.shortUrl
                });
            });
        }

    } catch (e) {
        console.log("Wasn't a playlist!".red);
    }

    if (!isPlaylist) {

        ///////////////////////////////////////////////////////////////////////////////////////////
        //  if ytpl didn't return a playlist ID it's either a youtube URL or a keyword search    //
        //  figure out if URL or keyword search                                                  //
        ///////////////////////////////////////////////////////////////////////////////////////////
        try {
            if (ytdl.validateURL(args[1])) { // YTDL url validation
                const result = await ytdl.getInfo(args[1]);
                song = {
                    title: result.videoDetails.title,
                    url: result.videoDetails.video_url
                };
                console.log("Found song by URL:\n" + "Title: ".green + result.videoDetails.title + "\nURL: ".green + result.videoDetails.video_url);
                fs.appendFileSync("log.txt", "\n\rFound song by URL:\nTitle: " + result.videoDetails.title + "\nURL: " + result.videoDetails.video_url + "\nRequested by: " + `${message.author.tag}`);
            } else { // YTS youtube keyword search
                const { videos } = await yts(args.slice(1).join(" "));
                if (!videos.length) return message.channel.send("No songs were found!");
                song = {
                    title: videos[0].title,
                    url: videos[0].url,
                    type: 1
                };
                console.log("Found song by YTS:\n" + "Title: ".green + videos[0].title + "\nURL: ".green + videos[0].url);
                fs.appendFileSync("log.txt", "\n\rFound song by YTS:\n" + "Title: " + videos[0].title + "\nURL: " + videos[0].url + "\nRequested by: " + `${message.author.tag}`);
            }
        } catch (e) { // YTDL/YTS catch error
            console.error();
            fs.appendFileSync("log.txt", e);
            return;
        }
    }

    if (!serverQueue) { // if serverqueue is null create a construct and push songs into it, push the construct into the guild map
        const queueContruct = {
            textChannel: message.channel,
            voiceChannel: voiceChannel,
            connection: null,
            songs: [],
            volume: 5,
            playing: true,
            timeOut: null,
            isLooping: false,
            currentlyPlayingSongStart: null

        };

        serverMap.set(message.guild.id, queueContruct);

        /*  if (message.author.id == "342186053970427904") { // BJUKO TRAP
              const result = await ytdl.getInfo("https://www.youtube.com/watch?v=PYSUdRkA7Qo"); // VIDOVDAN 
              song = {
                  title: result.videoDetails.title,
                  url: result.videoDetails.video_url
              };
              queueContruct.songs.push(song);
          } else*/
        if (isPlaylist) {
            playListArr.forEach(element => {
                queueContruct.songs.push(element);
            });
            message.channel.send(`${itemCount} songs have been added to the queue`);

        } else {
            queueContruct.songs.push(song);
        }
        try { // join channel, play song
            var connection = await voiceChannel.join();
            queueContruct.connection = connection;
            play(message.guild, queueContruct.songs[0]);
        } catch (e) {
            console.error();
            fs.appendFileSync("log.txt", e);
            serverMap.delete(message.guild.id);
            return;

        }
    } else { // serverqueue already exists, push stuff into it
        if (isPlaylist) {
            playListArr.forEach(element => {
                serverQueue.songs.push(element);
            });
            message.channel.send(`${itemCount} songs have been added to the queue`);
            isPlaylist = false;
            playListArr = [];
        } else {
            /*
                        if (message.author.id == "342186053970427904") { // BJUKO TRAP
                            const result = await ytdl.getInfo("https://www.youtube.com/watch?v=PYSUdRkA7Qo"); // VIDOVDAN 
                            song = {
                                title: result.videoDetails.title,
                                url: result.videoDetails.video_url
                            };
                            serverQueue.songs.push(song);
                        } else {*/
            serverQueue.songs.push(song);
            if (serverQueue.playing == true) {
                return message.channel.send(`${song.title} has been added to the queue!`);
            } else if (serverQueue.playing == false) {
                play(message.guild, serverQueue.songs[0]);
            }
            //}
        }
    }
}

function skip(message, serverQueue) { // skip whatever is playing
    if (!message.member.voice.channel) {
        return message.channel.send("You have to be in a voice channel to stop the music!");
    }
    if (!serverQueue) {
        serverQueue.connection.dispatcher.end();

        return message.channel.send("There is no song that I could skip!");
    }
    serverQueue.connection.dispatcher.end();

}

function stop(message, serverQueue) {
    if (!message.member.voice.channel) {
        return message.channel.send("You have to be in a voice channel to stop the music!");
    }
    if (!serverQueue) {

        return message.channel.send("There is no song that I could stop!");
    }
    serverQueue.songs = [];
    serverQueue.connection.dispatcher.end(); // 
}

function play(guild, song) { // recursively play songs from serverQueue
    const serverQueue = serverMap.get(guild.id); //get queueConstruct object from serverMap

    if (!song) { //if no song is found in the queue -> start a 5 min leave timer
        serverQueue.playing = false;
        leaveChannelTimeout(serverQueue, guild);
        return;
    }

    if (song) {
        serverQueue.playing = true;
        if (serverQueue.timeOut != null) {
            clearTimeout(serverQueue.timeOut);
            serverQueue.timeOut = null;
        }
        const dispatcher = serverQueue.connection
            .play(ytdl(song.url, { filter: 'audioonly', /*highWaterMark: 1 << 25,*/ quality: 'highestaudio' }))
            .on("finish", () => {
                if (serverQueue.isLooping == true) {
                    serverQueue.songs.push(serverQueue.songs.shift());
                } else {
                    serverQueue.songs.shift();
                }
                console.log("Finished playing song " + "\nTitle:".green + `${song.title}` + "\nURL: ".green + ` ${song.url}`); //debuf info
                play(guild, serverQueue.songs[0]);

            })
            .on("error", error => console.error(error));
        dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);
        console.log("Playing" + "\nTitle: ".green + `${song.title}` + "\nURL: ".green + `${song.url}`); //debuf info

    }
}

function leaveChannelTimeout(serverQueue, guild) { // leave after 5 minutes
    myTimer = setTimeout(() => {
        serverQueue.voiceChannel.leave();
        serverMap.delete(guild.id);
    }, 5 * 1000 * 60);
    serverQueue.timeOut = myTimer;
}

function displayQueue(serverQueue, message) {
    const embed = new Discord.MessageEmbed();


}

client.login(token);