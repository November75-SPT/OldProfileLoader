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
import { HashUtil } from "@spt/utils/HashUtil";
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
        const hashUtil:HashUtil = container.resolve<HashUtil>("HashUtil");
        
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
            
            const mainEquipmentStash = profile.characters.pmc.Inventory.equipment;
            const validItems: IItem[] = [];
            // temp fix for 1.0.0 users
            const missingItems: IItem[] = [];
            const missingValidItems: IItem[] = [];

            // strip off Player Equipment Slots 
            // from LocationLifecycleService line 1031
            // // Player Slots we care about
            const inventorySlots = [
                "FirstPrimaryWeapon",
                "SecondPrimaryWeapon",
                "Holster",
                "Scabbard",
                "Compass",
                "Headwear",
                "Earpiece",
                "Eyewear",
                "FaceCover",
                "ArmBand",
                "ArmorVest",
                "TacticalVest",
                "Backpack",
                "pocket1",
                "pocket2",
                "pocket3",
                "pocket4",
                "SpecialSlot1",
                "SpecialSlot2",
                "SpecialSlot3"
            ];


            // temporary fix for already use users
            // find inventorySlots item and inside items            
            // add main stash
            // inventorySlotsValidItems.push(items.find(x => x._id == mainEquipmentStash));
            for (const item of items) 
            {                 
                if (inventorySlots.includes(item.slotId)) 
                {
                    item.slotId = "hideout";
                    missingItems.push(item);

                    // find inside items
                    const childrenItems = itemHelper.findAndReturnChildrenAsItems(items,item._id);
                    for (let index = 1; index < childrenItems.length; index++) 
                    {
                        const childrenItem = childrenItems[index];                        
                        
                        if(!missingItems.includes(childrenItem)) missingItems.push(childrenItem);
                    }
                    continue;
                }
                

                // find no valid item and inside items and not stash
                if(!itemHelper.isValidItem(item._tpl) && item.parentId)
                {
                    const childrenItems = itemHelper.findAndReturnChildrenAsItems(items,item._id);
                    for (let index = 0; index < childrenItems.length; index++) 
                    {
                        const childrenItem = childrenItems[index];                        
                        
                        if(!missingItems.includes(childrenItem)) missingItems.push(childrenItem);
                    }
                }
            }

            // temporary fix check valid item
            for (const item of missingItems) 
            {            
                if (itemHelper.isValidItem(item._tpl))
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

                    missingValidItems.push(item);
                }
                else
                {
                    const childrenItems = itemHelper.findAndReturnChildrenAsItems(missingItems,item._id);

                    // 
                    if (childrenItems.length > 1 && childrenItems[0].parentId) 
                    {
                        logger.info(`${childrenItems[0]._id} is not valid item pop out ${childrenItems.length-1} items`);
                        
                        for (let index = 1; index < childrenItems.length; index++)
                        {
                            const childrenItem = childrenItems[index];
    
                            // Filters out items that are only in the current item.
                            // Prevents them from going deeper.
                            if (childrenItem.parentId != childrenItems[0]._id ) continue;
    
                            logger.info(`${childrenItem._id} pop out to ${childrenItems[0].parentId}`);
                            childrenItem.parentId = childrenItems[0].parentId;
    
                            // if item is have to relocate
                            // if item is inside container then item location will be conflict could erase item
                            // // try use  inventoryHelper.getContainerMap    containerHelper.findSlotForItem but too much work
                            // pop out main stash
                            // changing to hideout will be whatever it is pop out to  main stash
                            if (childrenItem.slotId) childrenItem.slotId = "hideout";
                            // if pop out to main stash location have to be delete otherwise it is disappear
                            if (childrenItem.location) childrenItem.location = undefined; 
                        }
                    }
                }

            }
            logger.info(`missingValidItems: ${missingValidItems.length}`);




            for (const item of items) 
            { 
                //TODO if mail stash is full item disappear
                //it is client bug restart will be refresh appear





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

                    // if inventorySlots then change to main stash
                    if (inventorySlots.includes(item.slotId)) 
                    {
                        
                        // main is hideout, others like inside container is main
                        item.slotId = "hideout";  
                    }
                    validItems.push(item);
                }
                else
                {
                    // Attach an item that has this item as its parent and link the parent to its grandparent.
                    // check container     
                    // main stash has no parentId  
                    // return is Recursive search childrenItems            
                    const childrenItems = itemHelper.findAndReturnChildrenAsItems(items,item._id);

                    // 
                    if (childrenItems.length > 1 && childrenItems[0].parentId) 
                    {          
                        logger.info(`${childrenItems[0]._id} is not valid item pop out ${childrenItems.length-1} items`);
                        
                        for (let index = 1; index < childrenItems.length; index++)
                        {
                            const childrenItem = childrenItems[index];

                            // Filters out items that are only in the current item.
                            // Prevents them from going deeper.
                            if (childrenItem.parentId != childrenItems[0]._id ) continue;

                            logger.info(`${childrenItem._id} pop out to ${childrenItems[0].parentId}`);
                            childrenItem.parentId = childrenItems[0].parentId;

                            // if item is have to relocate
                            // if item is inside container then item location will be conflict could erase item
                            // // try use  inventoryHelper.getContainerMap    containerHelper.findSlotForItem but too much work
                            // pop out main stash
                            // changing to hideout will be whatever it is pop out to  main stash
                            if(childrenItem.slotId) childrenItem.slotId = "hideout";
                            // if pop out to main stash location have to be delete otherwise it is not all but few things disappear 
                            if (childrenItem.location) childrenItem.location = undefined;
                        }                        
                    }
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

            // temp fix
            const missingItemsGiftMessageText =
                `Old Profile From Name: ${profile.info.username}(${key})\n` +
                `forgeted Inventory Slots Items and not validItem inside items` +
                `Send Items total number ${missingValidItems.length}\n` +
                `Send time is ${sendDate.toLocaleString()}\n` +
                `Max Storage day is ${mailItemExpirationDays}\n` +
                `Items hold until ${maxStorageItemsDate.toLocaleString()}`;
            const missingItemItemsGift:IGift = {
                items: missingValidItems,
                sender: GiftSenderType.USER,
                senderDetails: {
                    _id: hashUtil.generate(),
                    aid: profile.info.aid+1,
                    Info:{
                        Nickname: profile.characters.pmc.Info.Nickname,
                        Side: profile.characters.pmc.Info.Side,
                        Level: profile.characters.pmc.Info.Level,
                        MemberCategory: profile.characters.pmc.Info.MemberCategory,
                        SelectedMemberCategory: profile.characters.pmc.Info.SelectedMemberCategory,
                    },
                },
                messageText: missingItemsGiftMessageText,
                associatedEvent: SeasonalEventType.NONE,
                collectionTimeHours: 24 * mailItemExpirationDays,
                maxToSendPlayer: 1,
            }

            
            const giftBaseCode = `OldProfileLoader`;
            giftConfig.gifts[giftBaseCode+key] = newGift;
            //temp fix
            giftConfig.gifts[giftBaseCode+`MissingItems`+key] = missingItemItemsGift;


            // create new profile with delete valid items
            // If I reinstall a mod that didn’t exist in the future, I can just call it up again with this new profile.            
            const inventory = profile.characters.pmc.Inventory
            for (let index = 0; index < inventory.items.length; index++) 
            {
                if (validItems.includes(inventory.items[index])) 
                {
                    inventory.items.splice(index,1);
                    index--;
                }                
            }

            const filePath = `user/mods/November75-OldProfileLoader/newProfileWithLeftoverItems/${key}.json`;
            const jsonProfile = jsonUtil.serialize(profile,true);
            fileSystem.write(filePath, jsonProfile);
            
        }
    }
}

export const mod = new OldProfileLoader();
