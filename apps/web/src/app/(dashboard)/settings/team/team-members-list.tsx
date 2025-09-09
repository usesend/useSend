"use client";

import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@usesend/ui/src/table";
import { api } from "~/trpc/react";
import { Button } from "@usesend/ui/src/button";
import Spinner from "@usesend/ui/src/spinner";
import { formatDistanceToNow } from "date-fns";
import { Role } from "@prisma/client";
import { EditTeamMember } from "./edit-team-member";
import { DeleteTeamMember } from "./delete-team-member";
import { ResendTeamInvite } from "./resend-team-invite";
import { DeleteTeamInvite } from "./delete-team-invite";
import { useTeam } from "~/providers/team-context";
import { useSession } from "next-auth/react";

export default function TeamMembersList() {
  const { currentIsAdmin } = useTeam();
  const { data: session } = useSession();
  const teamUsersQuery = api.team.getTeamUsers.useQuery();
  const teamInvitesQuery = api.team.getTeamInvites.useQuery();

  // Combine team users and invites for display
  const teamMembers = teamUsersQuery.data || [];
  const pendingInvites = teamInvitesQuery.data || [];

  const isLoading = teamUsersQuery.isLoading || teamInvitesQuery.isLoading;

  return (
    <div className="mt-10 flex flex-col gap-4">
      <div className="flex flex-col rounded-xl border border-border shadow">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="rounded-tl-xl">User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="rounded-tr-xl">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow className="h-32">
                <TableCell colSpan={5} className="text-center py-4">
                  <Spinner
                    className="w-6 h-6 mx-auto"
                    innerSvgClass="stroke-primary"
                  />
                </TableCell>
              </TableRow>
            ) : teamMembers.length > 0 ? (
              teamMembers.map((member) => (
                <TableRow key={member.userId} className="">
                  <TableCell className="font-medium">
                    {member.user?.email || "Unknown user"}
                  </TableCell>
                  <TableCell>
                    <div className=" rounded capitalize py-1 text-xs">
                      {member.role.toLowerCase()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-center w-[100px] rounded capitalize py-1 text-xs bg-green/15 text-green border border-green/25">
                      Active
                    </div>
                  </TableCell>
                  <TableCell>
                    {formatDistanceToNow(new Date(member.user.createdAt), {
                      addSuffix: true,
                    })}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      {currentIsAdmin ? (
                        <EditTeamMember
                          teamUser={{
                            ...member,
                            userId: String(member.userId),
                          }}
                        />
                      ) : null}
                      {currentIsAdmin || session?.user.id == member.userId ? (
                        <DeleteTeamMember
                          teamUser={{
                            userId: String(member.userId),
                            role: member.role,
                            email: member.user?.email || "Unknown user",
                          }}
                          self={session?.user.id == member.userId}
                        />
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow className="h-32">
                <TableCell colSpan={5} className="text-center py-4">
                  No team members found
                </TableCell>
              </TableRow>
            )}

            {/* Pending invites section */}
            {pendingInvites.length > 0 && (
              <>
                {pendingInvites.map((invite) => (
                  <TableRow key={invite.id} className="">
                    <TableCell className="font-medium">
                      {invite.email}
                    </TableCell>
                    <TableCell>
                      <div className=" w-[100px] rounded capitalize py-1 text-xs">
                        {invite.role.toLowerCase()}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-center w-[100px] rounded capitalize py-1 text-xs bg-yellow/15 text-yellow border border-yellow/25">
                        Pending
                      </div>
                    </TableCell>
                    <TableCell>
                      {formatDistanceToNow(new Date(invite.createdAt), {
                        addSuffix: true,
                      })}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {currentIsAdmin ? (
                          <ResendTeamInvite invite={invite} />
                        ) : null}
                        {currentIsAdmin ? (
                          <DeleteTeamInvite invite={invite} />
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
