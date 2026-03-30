/**
 * Maps icon hint strings from AgentDefinition to actual MUI icon components.
 * This keeps the agentRegistry.ts free of JSX imports while still being type-safe.
 *
 * To add a new icon: import it and add a case below.
 */

import React from 'react';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import DataObjectRoundedIcon from '@mui/icons-material/DataObjectRounded';
import SummarizeRoundedIcon from '@mui/icons-material/SummarizeRounded';
import AnalyticsRoundedIcon from '@mui/icons-material/AnalyticsRounded';
import LabelRoundedIcon from '@mui/icons-material/LabelRounded';
import FactCheckRoundedIcon from '@mui/icons-material/FactCheckRounded';
import CalculateRoundedIcon from '@mui/icons-material/CalculateRounded';
import ReportProblemRoundedIcon from '@mui/icons-material/ReportProblemRounded';
import AutoFixHighRoundedIcon from '@mui/icons-material/AutoFixHighRounded';
import EditNoteRoundedIcon from '@mui/icons-material/EditNoteRounded';
import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import PostAddRoundedIcon from '@mui/icons-material/PostAddRounded';
import ContentCutRoundedIcon from '@mui/icons-material/ContentCutRounded';
import NoteAddRoundedIcon from '@mui/icons-material/NoteAddRounded';
import BrushRoundedIcon from '@mui/icons-material/BrushRounded';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import DocumentScannerRoundedIcon from '@mui/icons-material/DocumentScannerRounded';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import CompareRoundedIcon from '@mui/icons-material/CompareRounded';
import ChatRoundedIcon from '@mui/icons-material/ChatRounded';
import SchoolRoundedIcon from '@mui/icons-material/SchoolRounded';
import AltRouteRoundedIcon from '@mui/icons-material/AltRouteRounded';
import StickyNote2RoundedIcon from '@mui/icons-material/StickyNote2Rounded';
import DriveFileRenameOutlineRoundedIcon from '@mui/icons-material/DriveFileRenameOutlineRounded';
import FolderSharedRoundedIcon from '@mui/icons-material/FolderSharedRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import SecurityRoundedIcon from '@mui/icons-material/SecurityRounded';

const ICON_SX = { fontSize: '1rem' };

const ICON_MAP: Record<string, React.ReactNode> = {
  SmartToyRounded: <SmartToyRoundedIcon sx={ICON_SX} />,
  DataObjectRounded: <DataObjectRoundedIcon sx={ICON_SX} />,
  SummarizeRounded: <SummarizeRoundedIcon sx={ICON_SX} />,
  AnalyticsRounded: <AnalyticsRoundedIcon sx={ICON_SX} />,
  LabelRounded: <LabelRoundedIcon sx={ICON_SX} />,
  FactCheckRounded: <FactCheckRoundedIcon sx={ICON_SX} />,
  CalculateRounded: <CalculateRoundedIcon sx={ICON_SX} />,
  ReportProblemRounded: <ReportProblemRoundedIcon sx={ICON_SX} />,
  AutoFixHighRounded: <AutoFixHighRoundedIcon sx={ICON_SX} />,
  EditNoteRounded: <EditNoteRoundedIcon sx={ICON_SX} />,
  AssignmentRounded: <AssignmentRoundedIcon sx={ICON_SX} />,
  PostAddRounded: <PostAddRoundedIcon sx={ICON_SX} />,
  ContentCutRounded: <ContentCutRoundedIcon sx={ICON_SX} />,
  NoteAddRounded: <NoteAddRoundedIcon sx={ICON_SX} />,
  BrushRounded: <BrushRoundedIcon sx={ICON_SX} />,
  AccountTreeRounded: <AccountTreeRoundedIcon sx={ICON_SX} />,
  DocumentScannerRounded: <DocumentScannerRoundedIcon sx={ICON_SX} />,
  TaskAltRounded: <TaskAltRoundedIcon sx={ICON_SX} />,
  CompareRounded: <CompareRoundedIcon sx={ICON_SX} />,
  ChatRounded: <ChatRoundedIcon sx={ICON_SX} />,
  SchoolRounded: <SchoolRoundedIcon sx={ICON_SX} />,
  AltRouteRounded: <AltRouteRoundedIcon sx={ICON_SX} />,
  StickyNote2Rounded: <StickyNote2RoundedIcon sx={ICON_SX} />,
  DriveFileRenameOutlineRounded: <DriveFileRenameOutlineRoundedIcon sx={ICON_SX} />,
  FolderSharedRounded: <FolderSharedRoundedIcon sx={ICON_SX} />,
  SendRounded: <SendRoundedIcon sx={ICON_SX} />,
  SecurityRounded: <SecurityRoundedIcon sx={ICON_SX} />,
};

/** Resolve an icon hint string to a React node. Falls back to SmartToyRounded. */
export function resolveAgentIcon(hint: string): React.ReactNode {
  return ICON_MAP[hint] ?? ICON_MAP['SmartToyRounded'];
}
