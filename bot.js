const { WebSocketClient } = require("@terra-money/terra.js");
const fs = require("fs-extra");
const express = require("express");
const expressApp = express();
expressApp.use(express.static("static"));
expressApp.use(express.json());
require("dotenv").config();
const { Telegraf } = require("telegraf");

const ws = new WebSocketClient(
  "wss://terra-classic-rpc.publicnode.com:443/websocket",
  -1
);

const bot = new Telegraf(process.env.BOT_TOKEN);

// Fungsi untuk menghasilkan ID unik
const generateUniqueId = () => Math.random().toString(36).substr(2, 9);

const pairs = [
  {
    address: "terra1mkl973d34jsuv0whsfl43yw3sktm8kv7lgn35fhe6l88d0vvaukq5nq929",
    id: generateUniqueId(),
  },
];

ws.on("connect", () => {
  console.log("Successfully Connected!");
});

const logicSubscribe = async (ctx) => {
  const chatId = ctx.chat.id;

  try {
    const recordFile = "./record.json";
    const records = await fs.readJson(recordFile);

    const registeredAddresses = (records[chatId]?.paired_address || []).map(
      (pair) => pair.address
    );

    const unregisteredPairs = pairs
      .filter((pair) => !registeredAddresses.includes(pair.address))
      .map(({ address, id }) => ({
        text: address,
        callback_data: `subs_${id}`,
      }))
      .map((button) => [button]);

    if (unregisteredPairs.length > 0) {
      await ctx.reply(
        "Choose the pair address you want to follow the update below:",
        {
          reply_markup: {
            inline_keyboard: unregisteredPairs,
          },
        }
      );
    } else {
      await ctx.reply("You are already subscribed to all available addresses.");
    }
  } catch (error) {
    await ctx.reply("An error occurred while processing your request.");
  }
};

const logicUnsubscribe = async (ctx) => {
  const chatId = ctx.chat.id;

  try {
    const recordFile = "./record.json";
    const records = await fs.readJson(recordFile);

    if (records[chatId]) {
      const pairedAddresses = records[chatId].paired_address;

      if (pairedAddresses.length > 0) {
        const inlineButtons = pairedAddresses
          .map((pair) => ({
            text: pair.address.substring(0, 30) + "...",
            callback_data: `unsub_${pair.id}`,
          }))
          .map((button) => [button]);

        const message =
          "You are subscribed to the following addresses. Click on an address to unsubscribe:";
        await ctx.reply(message, {
          reply_markup: {
            inline_keyboard: inlineButtons,
          },
        });
      } else {
        await ctx.reply("You are not subscribed to any addresses.");
      }
    } else {
      await ctx.reply("You are not subscribed to any addresses.");
    }
  } catch (error) {
    await ctx.reply("An error occurred while processing your request.");
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
    `Hello there! Welcome to the Terra Listener Bot. \n /start - Start the Terra Listener Bot \n /subscribe - Subscribe for latest update contract transaction \n /unsubscribe - Unsubscribe from contract transaction update \n /openweb - Show List Coin Website`
  );
});

bot.command("subscribe", async (ctx) => {
  logicSubscribe(ctx);
});

bot.command("unsubscribe", async (ctx) => {
  logicUnsubscribe(ctx);
});

bot.command("openweb", (ctx) => {
  let openMessage =
    "Welcome to the Coin Bot! Please select a website from the list below.";
  bot.telegram.sendMessage(ctx.chat.id, openMessage, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "CoinHall", web_app: { url: "https://coinhall.org/" } }],
      ],
    },
  });
});

bot.action(/^unsub_.{9}$/, async (ctx) => {
  const callbackData = ctx.callbackQuery.data;
  const id = callbackData.replace("unsub_", "");
  const chatId = ctx.chat.id;

  try {
    await ctx.answerCbQuery();

    const recordFile = "./record.json";
    const records = await fs.readJson(recordFile);

    if (records[chatId]) {
      let { paired_address } = records[chatId];

      const updatedAddresses = paired_address.filter((pair) => pair.id !== id);

      if (updatedAddresses.length === 0) {
        delete records[chatId];
        await ctx.reply("You have unsubscribed from all addresses.");
      } else {
        records[chatId].paired_address = updatedAddresses;
        await ctx.reply(`You have unsubscribed from address with ID: ${id}`);
      }

      await fs.writeJson(recordFile, records, { spaces: 2 });
    } else {
      await ctx.reply("You are not subscribed to this address.");
    }
  } catch (error) {
    await ctx.reply("Error handling unsubscribe callback: " + error);
  }
});

bot.action(/^subs_.{9}$/, async (ctx) => {
  const callbackData = ctx.callbackQuery.data;
  const id = callbackData.replace("subs_", "");
  const chatId = ctx.chat.id;

  try {
    await ctx.answerCbQuery();

    const pair = pairs.find((p) => p.id === id);
    if (pair) {
      await ctx.reply(`You selected address: ${pair.address}`);

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
      await ctx.reply("Address not found.");
    }
  } catch (error) {
    await ctx.reply("Error handling callback:" + error);
  }
});

ws.subscribeTx({ "wasm.action": "swap" }, async (data) => {
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

    let message = "";
    if (offerAsset && askAsset) {
      if (askAsset.value == contract_addr) {
        message =
          `Transaction Buy: \n` +
          `Selling: ${offerAsset.value} \n` +
          `For: ${askAsset.value}`;
      } else {
        message =
          `Transaction Sell: \n` +
          `Selling: ${offerAsset.value} \n` +
          `For: ${askAsset.value}`;
      }
    }

    if (offerAmount && askAmount) {
      message += `\n\nTransaction Details: \nAmount: ${
        offerAmount.value / 1000000
      } ${offerAsset.value} for ${askAmount.value / 1000000} ${askAsset.value}`;
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
