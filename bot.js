const { WebSocketClient } = require("@terra-money/terra.js");
const fs = require("fs-extra");
const express = require("express");
const expressApp = express();
expressApp.use(express.static("static"));
expressApp.use(express.json());
require("dotenv").config();
const { Telegraf } = require("telegraf");
const { default: fetch } = require("node-fetch")


const ws = new WebSocketClient(
  "wss://terra-classic-rpc.publicnode.com:443/websocket",
  -1
);

const bot = new Telegraf(process.env.BOT_TOKEN);

ws.on("connect", () => {
  console.log("Successfully Connected!");
});

const formatDenom = (denom) => {
  if (!denom) {
    return "";
  }

  if (denom[0] === "u") {
    const f = denom.slice(1);

    if (f.length > 3) {
      return f === "luna" ? "Lunc" : f.toUpperCase();
    }

    return f.slice(0, 2).toUpperCase() + `TC`;
  }

  return denom;
};

const query = async (address, query) => {
  const url = `https://terra-classic-lcd.publicnode.com/cosmwasm/wasm/v1/contract/${address}/smart/${query}`
  return await (await fetch(url)).json()
}

const getSymbol = async (assetInfo) => {
  if ("native_token" in assetInfo) return formatDenom(assetInfo.native_token.denom)
  else if ("token" in assetInfo) {
    const { data: { symbol } } = await query(assetInfo.token.contract_addr, "eyJ0b2tlbl9pbmZvIjoge319")
    return symbol;
  }
  return undefined;
}

const getWebPath = (path) => `https://token-bot.riscarevan.tech${path}`

const fetchPairDetails = async (addresses) => {
  const pairData = [];

  for (const address of addresses) {
    const { data: { asset_infos } } = await query(address, "eyJwYWlyIjoge319");
    const firstSymbol = await getSymbol(asset_infos[0])
    const secondSymbol = await getSymbol(asset_infos[1])
    pairData.push({
      id: address.substr(5, 9),
      address,
      firstIdentifier: asset_infos[0].native_token?.denom ?? asset_infos[0].token.contract_addr,
      secondIdentifier: asset_infos[1].native_token?.denom ?? asset_infos[1].token.contract_addr,
      firstSymbol,
      secondSymbol
    })
  }

  return pairData
}

const fetchTokenDetails = async (tokens) => {
  const arr = {}

  for (const { token_address, burn_address } of tokens) {
    const { data } = await query(token_address, "eyJ0b2tlbl9pbmZvIjoge319")
    arr[token_address] = {
      ...data,
      burn_address
    }
  }

  return arr
}

const fetchPairs = async () => {
  const { data: { pairs } } = await query("terra1rg6595vgxw2zcl8zzfkpt7nyg5nmksv8qg2pc79fkamnwmnyz25s8zgdhz", "eyJyZWdpc3RlcmVkX3BhaXIiOiB7fX0=")
  return await fetchPairDetails(pairs)
}

const fetchTokens = async () => {
  const { data: { tokens } } = await query("terra1rg6595vgxw2zcl8zzfkpt7nyg5nmksv8qg2pc79fkamnwmnyz25s8zgdhz", "eyJyZWdpc3RlcmVkX3Rva2VuIjoge319")
  return await fetchTokenDetails(tokens)
}

const logicSubscribe = async (ctx) => {
  const chatId = ctx.chat.id;
  const loadingMsg = await ctx.reply("Please wait...")

  try {
    const pairs = await fetchPairs();
    const recordFile = "./record.json";
    const records = await fs.readJson(recordFile);

    const registeredAddresses = (records[chatId]?.paired_address || []).map(
      (pair) => pair.address
    );

    const unregisteredPairs = pairs
      .filter((pair) => !registeredAddresses.includes(pair.address))
      .map(({ address, id, firstSymbol, secondSymbol }) => ({
        text: `${firstSymbol} - ${secondSymbol}`,
        callback_data: `subs_${id}`,
      }))
      .map((button) => [button]);

    if (unregisteredPairs.length > 0) {
      await ctx.editMessageText(
        "Choose the pair address you want to follow the update below:",
        {
          message_id: loadingMsg.message_id,
          reply_markup: {
            inline_keyboard: unregisteredPairs,
          },
        }
      );
    } else {
      await ctx.editMessageText("You are already subscribed to all available addresses.", { message_id: loadingMsg.message_id });
    }
  } catch (error) {
    await ctx.editMessageText("An error occurred while processing your request.", { message_id: loadingMsg.message_id });
  }
};

const logicUnsubscribe = async (ctx) => {
  const chatId = ctx.chat.id;


  const loadingMsg = await ctx.reply("Please wait...")
  try {
    const recordFile = "./record.json";
    const records = await fs.readJson(recordFile);

    if (records[chatId]) {
      const pairedAddresses = records[chatId].paired_address;
      const pairs = await fetchPairDetails(pairedAddresses.map(e => e.address))

      if (pairedAddresses.length > 0) {
        const inlineButtons = pairs
          .map((pair) => ({
            text: `${pair.firstSymbol} - ${pair.secondSymbol}`,
            callback_data: `unsub_${pair.id}`,
          }))
          .map((button) => [button]);

        const message =
          "You are subscribed to the following pairs. Click on an address to unsubscribe:";
        await ctx.editMessageText(message, {
          message_id: loadingMsg.message_id,
          reply_markup: {
            inline_keyboard: inlineButtons,
          },
        });
      } else {
        await ctx.editMessageText("You are not subscribed to any pairs.", { message_id: loadingMsg.message_id });
      }
    } else {
      await ctx.editMessageText("You are not subscribed to any pairs.", { message_id: loadingMsg.message_id });
    }
  } catch (error) {
    await ctx.editMessageText("An error occurred while processing your request.", { message_id: loadingMsg.message_id });
  }
};

// bot command (channel)
bot.on("channel_post", async (ctx) => {
  const { text, chat } = ctx.channelPost;

  if (text.startsWith("/start")) {
    bot.telegram.sendMessage(
      chat.id,
      `Hello there! Welcome to the Terra Listener Bot. \n /start - Start the Terra Listener Bot \n /subscribe - Subscribe for latest update contract transaction \n /unsubscribe - Unsubscribe from contract transaction update \n /openweb - Show List Coin Website`
    );
  } else if (text.startsWith("/subscribe")) {
    // Your subscribe logic
    logicSubscribe(ctx);
  } else if (text.startsWith("/unsubscribe")) {
    // Your unsubscribe logic
    logicUnsubscribe(ctx);
  }
});

// bot command (private chat)
bot.command("start", (ctx) => {
  bot.telegram.sendMessage(
    ctx.chat.id,
    `Hello there! Welcome to the Terra Listener Bot. \n /start - Start the Terra Listener Bot \n /subscribe - Subscribe for latest update contract transaction \n /unsubscribe - Unsubscribe from contract transaction update`
  );
});

bot.command("subscribe", async (ctx) => {
  logicSubscribe(ctx);
});

bot.command("unsubscribe", async (ctx) => {
  logicUnsubscribe(ctx);
});

bot.command("register_pair", (ctx) => {
  bot.telegram.sendMessage(
    ctx.chat.id,
    "Register your token pair so it can be swapped from this bot",
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Connect Wallet", web_app: { url: getWebPath("") } }],
          [{ text: "Register Pair", web_app: { url: getWebPath("/register-pair") } }],
        ],
      },
    }
  );
});

bot.command("register_token", (ctx) => {
  bot.telegram.sendMessage(
    ctx.chat.id,
    "Register your token so it can be burn from this bot",
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Connect Wallet", web_app: { url: getWebPath("") } }],
          [{ text: "Register Token", web_app: { url: getWebPath("/register-token") } }],
        ],
      },
    }
  );
});

bot.command("pair_list", (ctx) => {
  bot.telegram.sendMessage(
    ctx.chat.id,
    "Display all the registered pair",
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Pair List", web_app: { url: getWebPath("/pair-list") } }],
        ],
      },
    }
  );
});

bot.command("token_list", (ctx) => {
  bot.telegram.sendMessage(
    ctx.chat.id,
    "Display all the registered token to burn",
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Token List", web_app: { url: getWebPath("/token-list") } }],
        ],
      },
    }
  );
});

bot.command("swap", async (ctx) => {
  const loadingMsg = await ctx.reply("Please wait...")

  try {
    const pairs = await fetchPairs();
    await ctx.deleteMessage(loadingMsg.message_id)
    await bot.telegram.sendMessage(
      ctx.chat.id,
      "Available pairs to swap",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Connect Wallet", web_app: { url: getWebPath("") } }],
            ...pairs.map(e => ([{ text: `${e.firstSymbol} - ${e.secondSymbol}`, web_app: { url: getWebPath(`/swap/${e.address}`) } }]))
          ],
        },
      }
    );
  } catch (e) {
    console.log(e)
    await ctx.editMessageText("An error occurred while processing your request.", { message_id: loadingMsg.message_id });
  }

});

bot.command("burn", async (ctx) => {
  const loadingMsg = await ctx.reply("Please wait...")

  try {
    const tokens = await fetchTokens();
    await ctx.deleteMessage(loadingMsg.message_id)
    await bot.telegram.sendMessage(
      ctx.chat.id,
      "Available token to burn",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Connect Wallet", web_app: { url: getWebPath("") } }],
            ...Object.values(tokens).map(e => ([
              { text: `${e.name} (${e.symbol})`, web_app: { url: getWebPath(`/burn/${e.burn_address}`) } }
            ]))
          ],
        },
      }
    );
  } catch (e) {
    console.log(e)
    await ctx.editMessageText("An error occurred while processing your request.", { message_id: loadingMsg.message_id });
  }
});

bot.command("leaderboard", async (ctx) => {
  const loadingMsg = await ctx.reply("Please wait...")

  try {
    const tokens = await fetchTokens();
    await ctx.deleteMessage(loadingMsg.message_id)
    await bot.telegram.sendMessage(
      ctx.chat.id,
      "Token burn leaderboard",
      {
        reply_markup: {
          inline_keyboard: [
            ...Object.values(tokens).map(e => ([
              { text: `Leaderboard ${e.name} (${e.symbol})`, web_app: { url: getWebPath(`/leaderboard/${e.burn_address}`) } }
            ]))
          ],
        },
      }
    );
  } catch (e) {
    console.log(e)
    await ctx.editMessageText("An error occurred while processing your request.", { message_id: loadingMsg.message_id });
  }
});

bot.action(/^unsub_.{9}$/, async (ctx) => {
  const callbackData = ctx.callbackQuery.data;
  const id = callbackData.replace("unsub_", "");
  const chatId = ctx.chat.id;

  const loadingMsg = await ctx.reply("Please wait...")
  try {
    await ctx.answerCbQuery();

    const recordFile = "./record.json";
    const records = await fs.readJson(recordFile);

    if (records[chatId]) {
      let { paired_address } = records[chatId];

      const updatedAddresses = paired_address.filter((pair) => pair.id !== id);

      if (updatedAddresses.length === 0) {
        delete records[chatId];
        await ctx.editMessageText("You have unsubscribed from all addresses.", { message_id: loadingMsg.message_id });
      } else {
        records[chatId].paired_address = updatedAddresses;
        await ctx.editMessageText(`You have unsubscribed from a pair`, { message_id: loadingMsg.message_id });
      }

      await fs.writeJson(recordFile, records, { spaces: 2 });
    } else {
      await ctx.editMessageText("You are not subscribed to this address.", { message_id: loadingMsg.message_id });
    }
  } catch (error) {
    await ctx.editMessageText("Error handling unsubscribe callback: " + error, { message_id: loadingMsg.message_id });
  }
});

bot.action(/^subs_.{9}$/, async (ctx) => {
  const callbackData = ctx.callbackQuery.data;
  const id = callbackData.replace("subs_", "");
  const chatId = ctx.chat.id;

  const loadingMsg = await ctx.reply("Please wait...")
  try {
    const pairs = await fetchPairs();
    await ctx.answerCbQuery();

    const pair = pairs.find((p) => p.id === id);
    if (pair) {
      await ctx.editMessageText(`You subscribed to: ${pair.firstSymbol} - ${pair.secondSymbol}`, { message_id: loadingMsg.message_id });

      const recordFile = "./record.json";
      const records = await fs.readJson(recordFile);

      if (!records[chatId]) {
        records[chatId] = {
          chat_id: chatId,
          paired_address: [{ address: pair.address, id: pair.id }],
        };

        // Simpan file record.json yang diperbarui
        await fs.writeJson(recordFile, records, { spaces: 2 });
        console.log(`Added chat_id ${chatId} to record.json.`);
      } else {
        const existingAddresses = records[chatId].paired_address;
        if (!existingAddresses.some((a) => a.id === pair.id)) {
          records[chatId].paired_address.push({
            address: pair.address,
            id: pair.id,
          });
          await fs.writeJson(recordFile, records, { spaces: 2 });
        }
      }
    } else {
      await ctx.editMessageText("Address not found.", { message_id: loadingMsg });
    }
  } catch (error) {
    await ctx.editMessageText("Error handling callback:" + error, { message_id: loadingMsg });
  }
});

ws.subscribeTx({ "wasm.action": "swap" }, async (data) => {
  const pairs = await fetchPairs();
  const { events } = data.value.TxResult.result;
  const wasmEvent = events.find(
    (e) =>
      e.type == "wasm" &&
      e.attributes.some((f) => f.key == "action" && f.value == "swap")
  );

  if (!wasmEvent) return;

  const { attributes } = wasmEvent;
  const { value: contractAddress } = attributes.find(
    (e) => e.key == "_contract_address"
  );

  let pair = pairs.find((e) => e.address == contractAddress);
  if (pair) {
    const assetLink = `https://terra-classic-lcd.publicnode.com/cosmwasm/wasm/v1/contract/${contractAddress}/smart/eyJwYWlyIjp7fX0=`;
    const datas = await fetch(assetLink);
    const fetchData = await datas.json();
    const assetInfo = fetchData.data.asset_infos[0];
    const contract_addr = assetInfo.token.contract_addr;

    const offerAsset = attributes.find((e) => e.key == "offer_asset");
    const askAsset = attributes.find((e) => e.key == "ask_asset");
    const offerAmount = attributes.find((e) => e.key == "offer_amount");
    const askAmount = attributes.find((e) => e.key == "return_amount");
    const offerSymbol = pair.firstIdentifier == offerAsset.value ? pair.firstSymbol : pair.secondSymbol;
    const askSymbol = pair.firstIdentifier == askAsset.value ? pair.firstSymbol : pair.secondSymbol;

    let message = "";
    // if (offerAsset && askAsset) {
    //   if (askAsset.value == contract_addr) {
    //     message =
    //       `Transaction Buy: \n` +
    //       `Selling: ${offerAsset.value} \n` +
    //       `For: ${askAsset.value}`;
    //   } else {
    //     message =
    //       `Transaction Sell: \n` +
    //       `Selling: ${offerAsset.value} \n` +
    //       `For: ${askAsset.value}`;
    //   }
    // }

    if (offerAmount && askAmount) {
      message += `\n\nSomeone is swap: \n ${offerAmount.value / 1000000
        } ${offerSymbol} for ${askAmount.value / 1000000} ${askSymbol}`;
    }

    const recordFile = "./record.json";
    const records = await fs.readJson(recordFile);

    for (const [chatId, data] of Object.entries(records)) {
      const { paired_address } = data;

      const isAddressRegistered = paired_address.some(
        (addressData) => addressData.address === contractAddress
      );

      if (isAddressRegistered) {
        try {
          await bot.telegram.sendMessage(
            chatId,
            message ||
            "A swap transaction has occurred on a registered contract address."
          );
        } catch (error) {
          console.error(`Failed to send message to chat_id ${chatId}:`, error);
        }
      }
    }
  }
});

ws.start();
bot.launch();
