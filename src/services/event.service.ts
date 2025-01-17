import { PendingEvent, Prisma, PrismaClient, Tickets } from "@prisma/client";
import httpStatus from "http-status";
import prisma from "../dbClient";
import ApiError from "../utils/ApiError";
import { Event, TicketCategory } from "@prisma/client";
import { ApiResponse } from "../models/models";
import blockchainService from "../services/blockchain.service";
import { v4 as uuidv4 } from 'uuid';


interface FilterEventsParams {
  page: number;
  pageSize: number;
  startDate: string;
  locationId?: string;
  endDate?: string;
  categoryTypeId?: string;
  sortBy?: "date" | "eventName";
  sortOrder?: "asc" | "desc";
}

const createEventFromPendingApprove = async (
  pendingEvent: PendingEvent,
  transaction: Prisma.TransactionClient,
): Promise<Event> => {
  if (pendingEvent.isActive) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Organizasyon daha önceden oluşturuldu");
  }

  if (!pendingEvent.ticketPriceEntity) {
    throw new ApiError(httpStatus.BAD_REQUEST, "ticketPriceEntity not found");
  }

  const ticketEntity = pendingEvent.ticketPriceEntity as unknown as {
    name: string;
    quantity: number;
    price: string;
  }[];

  const totalQuantity = ticketEntity.reduce((sum, ticketCat) => {
    return sum + ticketCat.quantity;
  }, 0);

  const eventContractAddress = await blockchainService.CreateNewNftContract(
    pendingEvent.eventName,
    totalQuantity
  );

  if (!eventContractAddress) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Error in deploying contract");
  }

  const newEvent = await transaction.event.create({
    data: {
      userId: pendingEvent.userId,
      date: pendingEvent.date,
      desc: pendingEvent.desc,
      eventName: pendingEvent.eventName,
      categoryId: pendingEvent.categoryId,
      categoryTypeId: pendingEvent.categoryTypeId,
      locationId: pendingEvent.locationId,
      contractAddress: eventContractAddress,
      time: pendingEvent.time,
      image: pendingEvent.image,
    },
  });

  const ticketCategories = await createTicketCategories(
    JSON.stringify(ticketEntity),
    newEvent.id,
    transaction
  );

  return newEvent;
};

const createTicketCategories = async (
  ticketEntity: string,
  eventId: string,
  transaction: Prisma.TransactionClient,
): Promise<TicketCategory[]> => {
  const categories = JSON.parse(ticketEntity);
  const list = [];
  for (const category of categories) {
    const res = await transaction.ticketCategory.create({
      data: {
        eventId,
        name: category.name,
        price: parseFloat(category.price),
        quantity: parseInt(category.quantity),
      },
    });
    list.push(res);
  }
  return list;
};

const createTickets = async (
  newEvent: Event,
  ticketCategories: TicketCategory[],
  pendingEvent: PendingEvent,
  eventContractAddress: string
): Promise<void> => {
  let tokenCounter = 0;
  const ticketData: Tickets[] = [];

  for (const ticketCat of ticketCategories) {
    for (let i = 0; i < ticketCat.quantity; i++) {
      const resFromMint = await blockchainService.generateTicketNFT(newEvent.image, newEvent.eventName, newEvent.desc ?? "", tokenCounter, eventContractAddress);
      if (resFromMint) {
        ticketData.push({
          id: uuidv4(), // Ensure uuidv4() returns a string
          userId: pendingEvent.userId,
          eventId: newEvent.id,
          ticketCategoryId: ticketCat.id,
          ticketTypeName: ticketCat.name,
          price: ticketCat.price,
          tokenId: tokenCounter.toString(),
          isUsed: false,
          sold: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        tokenCounter++;
      }
    }
  }

  if (ticketData.length > 0) {
    await prisma.tickets.createMany({
      data: ticketData,
    });
  }
};
// const createTicketCategories = async (
//   ticketEntity: string,
//   eventId: string,
//   transaction: Prisma.TransactionClient,
// ): Promise<TicketCategory[]> => {
//   const categories = JSON.parse(ticketEntity);
//   let list = [];
//   for (const category of categories) {
//     const res = await transaction.ticketCategory.create({
//       data: {
//         eventId,
//         name: category.name,
//         price: parseFloat(category.price),
//         quantity: parseInt(category.quantity),
//       },
//     });
//     list.push(res);
//   }
//   return list;
// };

const getEventById = async <Key extends keyof Event>(
  eventId: string,
): Promise<ApiResponse<Pick<Event, Key> | null>> => {
  try {
    const event = await prisma.event.findUnique({
      where: {
        id: eventId,
      },
      include: {
        location: true,
        eventCategory: true,
        eventCategoryType: true,
        creatorId: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return { success: true, date: new Date(), data: event };
  } catch (error) {
    console.log(error);
    throw new ApiError(httpStatus.BAD_REQUEST, error as any);
  }
};

const getEventByCategory = async <Key extends keyof Event>(
  categoryId: string,
): Promise<Event[]> => {
  try {
    const event = await prisma.event.findMany({
      where: {
        categoryId: categoryId,
      },
    });

    return event;
  } catch (error) {
    console.log(error);
    throw new ApiError(httpStatus.BAD_REQUEST, error as any);
  }
};

const getEventByCategoryType = async <Key extends keyof Event>(
  categoryTypeId: string,
): Promise<Event[]> => {
  try {
    const event = await prisma.event.findMany({
      where: {
        categoryTypeId: categoryTypeId,
      },
    });

    return event;
  } catch (error) {
    console.log(error);
    throw new ApiError(httpStatus.BAD_REQUEST, error as any);
  }
};

const getEventByNameSearch = async <Key extends keyof Event>(
  eventName: string,
): Promise<Event[]> => {
  try {
    const events = await prisma.event.findMany({
      where: {
        eventName: {
          contains: eventName,
        },
      },
    });

    return events;
  } catch (error) {
    console.error("Error searching events:", error);
    throw error;
  }
};

const getEventsByFilter = async (
  page: number,
  pageSize: number,
  locationId: string,
  endDate: string,
  categoryTypeId: string,
  sortBy = "date",
  sortOrder = "asc",
): Promise<ApiResponse<Event[]>> => {
  try {
    const filters: any = {};
    if (locationId) {
      filters.locationId = locationId;
    }

    filters.date = { gte: new Date() };

    if (endDate) {
      if (!filters.date) {
        filters.date = {};
      }
      filters.date.lte = new Date(endDate);
    }

    if (categoryTypeId) {
      filters.categoryTypeId = categoryTypeId;
    }

    const sortOptions: Record<string, any> = {};
    if (sortBy) {
      sortOptions[sortBy] = sortOrder;
    }
    const events = await prisma.event.findMany({
      where: filters,
      orderBy: sortOptions,
      include: {
        location: true,
        eventCategory: true,
        eventCategoryType: true,
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return {
      success: true,
      date: new Date(),
      data: events,
    };
  } catch (error) {
    console.error("Error searching events:", error);
    throw error;
  }
};

const buyEventTicket = async (
  eventId: string,
  ticketCategoryId: string,
  userId: string,
): Promise<ApiResponse<any>> => {
  try {
    const event = await getEventById(eventId);
    if (!event) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Event not found");
    }

    if (event.date < new Date()) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Event has already passed");
    }

    const ticketCategory = await prisma.ticketCategory.findUnique({
      where: {
        id: ticketCategoryId,
      },
    });

    if (!ticketCategory) {
      throw new ApiError(httpStatus.BAD_REQUEST, "ticketCategory not found");
    }

    const availableTickets = await prisma.tickets.count({
      where: {
        ticketCategoryId: ticketCategoryId,
        // userId: "",
        // sold: false
      },
    });

    if (availableTickets === 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "All tickets in this category are sold out",
      );
    }

    const userBoughtTicket = await prisma.tickets.findFirst({
      where: {
        userId: userId,
        eventId: eventId,
      },
    });

    if (userBoughtTicket) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "User has already bought a ticket for this event",
      );
    }

    //TODO purchase payment

    const randomTicket = await prisma.tickets.findFirst({
      where: {
        ticketCategoryId: ticketCategoryId,
        // sold: false
      },
      // orderBy: {
      //   // Order randomly
      //   createdAt: 'asc',
      // },
    });

    if (!randomTicket) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "No available ticket found for the given category",
      );
    }

    const updatedTicket = await prisma.tickets.update({
      where: {
        id: randomTicket.id,
      },
      data: {
        userId: userId,
      },
    });

    //TODO SEND NFT USER

    return {
      success: true,
      date: new Date(),
      data: updatedTicket,
    };
  } catch (error) {
    console.error("Error searching events:", error);
    throw error;
  }
};

async function getPendingEventById(id: string) {
  return prisma.pendingEvent.findUnique({
    where: {
      id,
    },
  });
}

export default {
  createEventFromPendingApprove,
  getEventById,
  getEventByCategory,
  getEventByCategoryType,
  getEventByNameSearch,
  createTicketCategories,
  getEventsByFilter,
  buyEventTicket,
  createTickets
};

