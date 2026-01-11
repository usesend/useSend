import { createRoute, z } from "@hono/zod-openapi";
import { CampaignStatus, Prisma } from "@prisma/client";
import { PublicAPIApp } from "~/server/public-api/hono";
import { db } from "~/server/db";

const statuses = Object.values(CampaignStatus) as [CampaignStatus];

const route = createRoute({
	method: "get",
	path: "/v1/campaigns",
	request: {
		query: z.object({
			page: z.string().optional().openapi({
				description: "Page number for pagination (default: 1)",
				example: "1",
			}),
			status: z.enum(statuses).optional().openapi({
				description: "Filter campaigns by status",
				example: "DRAFT",
			}),
			search: z.string().optional().openapi({
				description: "Search campaigns by name or subject",
				example: "newsletter",
			}),
		}),
	},
	responses: {
		200: {
			description: "Get list of campaigns",
			content: {
				"application/json": {
					schema: z.object({
						campaigns: z.array(
							z.object({
								id: z.string(),
								name: z.string(),
								from: z.string(),
								subject: z.string(),
								createdAt: z.string().datetime(),
								updatedAt: z.string().datetime(),
								status: z.string(),
								scheduledAt: z.string().datetime().nullable(),
								total: z.number().int(),
								sent: z.number().int(),
								delivered: z.number().int(),
								unsubscribed: z.number().int(),
							})
						),
						totalPage: z.number().int(),
					}),
				},
			},
		},
	},
});

function getCampaigns(app: PublicAPIApp) {
	app.openapi(route, async (c) => {
		const team = c.var.team;
		const pageParam = c.req.query("page");
		const statusParam = c.req.query("status") as
			| Prisma.EnumCampaignStatusFilter<"Campaign">
			| undefined;
		const searchParam = c.req.query("search");

		const page = pageParam ? Number(pageParam) : 1;
		const limit = 30;
		const offset = (page - 1) * limit;

		const whereConditions: Prisma.CampaignWhereInput = {
			teamId: team.id,
		};

		if (statusParam) {
			whereConditions.status = statusParam;
		}

		if (searchParam) {
			whereConditions.OR = [
				{
					name: {
						contains: searchParam,
						mode: "insensitive",
					},
				},
				{
					subject: {
						contains: searchParam,
						mode: "insensitive",
					},
				},
			];
		}

		const countP = db.campaign.count({ where: whereConditions });

		const campaignsP = db.campaign.findMany({
			where: whereConditions,
			select: {
				id: true,
				name: true,
				from: true,
				subject: true,
				createdAt: true,
				updatedAt: true,
				status: true,
				scheduledAt: true,
				total: true,
				sent: true,
				delivered: true,
				unsubscribed: true,
			},
			orderBy: {
				createdAt: "desc",
			},
			skip: offset,
			take: limit,
		});

		const [campaigns, count] = await Promise.all([campaignsP, countP]);

		return c.json({ campaigns, totalPage: Math.ceil(count / limit) });
	});
}

export default getCampaigns;
