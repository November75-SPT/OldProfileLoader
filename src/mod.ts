import { DependencyContainer } from "tsyringe";

import { IPreSptLoadMod } from "@spt/models/external/IPreSptLoadMod";
import { IPostDBLoadMod } from "@spt/models/external/IPostDBLoadMod";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { DatabaseServer } from "@spt/servers/DatabaseServer";
import { IDatabaseTables } from "@spt/models/spt/server/IDatabaseTables";
import { ItemHelper } from "@spt/helpers/ItemHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { BaseClasses } from "@spt/models/enums/BaseClasses";
import { IItem } from "@spt/models/eft/common/tables/IItem";

import { FileSystemSync } from "@spt/utils/FileSystemSync";
import { ISptProfile } from "@spt/models/eft/profile/ISptProfile";
import { GiftService } from "@spt/services/GiftService";

import { ConfigServer } from "@spt/servers/ConfigServer";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { IGift, IGiftsConfig } from "@spt/models/spt/config/IGiftsConfig"
import { GiftSenderType } from "@spt/models/enums/GiftSenderType";
import { SeasonalEventType } from "@spt/models/enums/SeasonalEventType";


import type {StaticRouterModService} from "@spt/services/mod/staticRouter/StaticRouterModService";
import { Traders } from "@spt/models/enums/Traders";
import { JsonUtil } from "@spt/utils/JsonUtil";
import { InventoryHelper } from "@spt/helpers/InventoryHelper";
import { IInventoryMoveRequestData } from "@spt/models/eft/inventory/IInventoryMoveRequestData";

import path from "node:path";
import { jsonc } from "jsonc";

class OldProfileLoader implements IPostDBLoadMod
{
    public postDBLoad(container: DependencyContainer): void 
    {
        const logger:ILogger = container.resolve<ILogger>("WinstonLogger");
        const staticRouterModService:StaticRouterModService = container.resolve<StaticRouterModService>("StaticRouterModService");
        const jsonUtil:JsonUtil = container.resolve<JsonUtil>("JsonUtil");
        
        const fileSystem = container.resolve<FileSystemSync>("FileSystemSync");
        const modConfig = jsonc.parse(fileSystem.read(path.resolve(__dirname, "../config/config.jsonc")));
        
        if (!modConfig.Enable) 
        {
            return;    
        }

        logger.info(`OldProfileLoader Start!`)        

        const databaseServer = container.resolve<DatabaseServer>("DatabaseServer");
        const tables: IDatabaseTables = databaseServer.getTables();
        const itemHelper: ItemHelper = container.resolve<ItemHelper>("ItemHelper");
        const profileHelper: ProfileHelper = container.resolve<ProfileHelper>("ProfileHelper");

        // get files to load
        const profiles: Map<string, ISptProfile> = new Map();
        const fileSystemSync = container.resolve<FileSystemSync>("FileSystemSync");

        const profileFilepath = `user/mods/November75-OldProfileLoader/oldProfile/`;
        const files = fileSystemSync.getFiles(profileFilepath, false, ["json"]);
        for (const file of files) 
        {
            const filename = `${FileSystemSync.getFileName(file)}`;
            const filePath = `${profileFilepath}${filename}.json`;
            profiles.set(filename, fileSystemSync.readJson(filePath));       
        }
        for (let [key, profile] of profiles) 
        {
            logger.info(`total: ${profile.characters.pmc.Inventory.items.length}`);
            const items = profile.characters.pmc.Inventory.items;
            
            const validItems :IItem[] = [];
            for (const item of items) 
            {                
                if(itemHelper.isValidItem(item._tpl))
                {
                    if (modConfig.ResetDurability) 
                    {
                        // delete Durability like Realism mod is not same as vanilla
                        if (item.upd?.MedKit) item.upd.MedKit = undefined;
                        if (item.upd?.Repairable) item.upd.Repairable = undefined;
                        if (item.upd?.FoodDrink) item.upd.FoodDrink = undefined;
                        if (item.upd?.Key) item.upd.Key = undefined;
                        if (item.upd?.Resource) item.upd.Resource = undefined;
                        if (item.upd?.RepairKit) item.upd.RepairKit = undefined;
                    }

                    validItems.push(item);
                }
                else
                {
                    logger.info(`${itemHelper.getItem(item._tpl)[1]?._name} is not valid`);
                }
            }
            logger.info(`validItemCount: ${validItems.length}`);


            // add gift            
            const configServer:ConfigServer = container.resolve<ConfigServer>("ConfigServer");
            const giftConfig:IGiftsConfig = configServer.getConfig<IGiftsConfig>(ConfigTypes.GIFTS);

            const mailItemExpirationDays = modConfig.MailItemExpirationDays;
            const sendDate = new Date();
            const maxStorageItemsDate = new Date();
            maxStorageItemsDate.setDate(maxStorageItemsDate.getDate() + mailItemExpirationDays);
            const messageText = `Old Profile From Name: ${profile.info.username}(${key})\n`+
                                `Total Item ${items.length} in send valid Item ${validItems.length}\n`+
                                `Send time is ${sendDate.toLocaleString()}\n`+
                                `Max Storage day is ${mailItemExpirationDays}\n`+
                                `Items hold until ${maxStorageItemsDate.toLocaleString()}`;

            const newGift:IGift = {
                items: validItems,
                sender: GiftSenderType.USER,
                senderDetails: {
                    _id: profile.info.id,
                    aid: profile.info.aid,
                    Info:{
                        Nickname: profile.characters.pmc.Info.Nickname,
                        Side: profile.characters.pmc.Info.Side,
                        Level: profile.characters.pmc.Info.Level,
                        MemberCategory: profile.characters.pmc.Info.MemberCategory,
                        SelectedMemberCategory: profile.characters.pmc.Info.SelectedMemberCategory,
                    },
                },
                messageText: messageText,
                associatedEvent: SeasonalEventType.NONE,
                collectionTimeHours: 24 * mailItemExpirationDays,
                maxToSendPlayer: 1,
            }

            
            const giftId = `OldProfileLoader${key}`;
            giftConfig.gifts[giftId] = newGift;
        }
    }
}

export const mod = new OldProfileLoader();
