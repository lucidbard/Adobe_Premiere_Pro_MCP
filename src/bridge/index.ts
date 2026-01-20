/**
 * Bridge module for communicating with Adobe Premiere Pro
 *
 * This module handles the communication between the MCP server and Adobe Premiere Pro
 * using various methods including UXP, ExtendScript, and file-based communication.
 */

import { Logger } from '../utils/logger.js';
import {
  BridgeNotInitializedError,
  BridgeInitializationError,
  PremiereNotFoundError,
  ScriptExecutionError,
  ResponseTimeoutError,
  ResponseParseError,
  PremiereErrorCode,
  getErrorMessage,
} from '../utils/errors.js';
import { ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

/** Default timeout for script execution responses in milliseconds */
const DEFAULT_RESPONSE_TIMEOUT_MS = 30000;

/** Polling interval when waiting for response files in milliseconds */
const RESPONSE_POLL_INTERVAL_MS = 100;

export interface PremiereProProject {
  id: string;
  name: string;
  path: string;
  isOpen: boolean;
  sequences: PremiereProSequence[];
  projectItems: PremiereProProjectItem[];
}

export interface PremiereProSequence {
  id: string;
  name: string;
  duration: number;
  frameRate: number;
  videoTracks: PremiereProTrack[];
  audioTracks: PremiereProTrack[];
}

export interface PremiereProTrack {
  id: string;
  name: string;
  type: 'video' | 'audio';
  clips: PremiereProClip[];
}

export interface PremiereProClip {
  id: string;
  name: string;
  inPoint: number;
  outPoint: number;
  duration: number;
  mediaPath?: string;
}

export interface PremiereProProjectItem {
  id: string;
  name: string;
  type: 'footage' | 'sequence' | 'bin';
  mediaPath?: string;
  duration?: number;
  frameRate?: number;
}

export interface PremiereProEffect {
  id: string;
  name: string;
  category: string;
  parameters: Record<string, any>;
}

export class PremiereProBridge {
  private logger: Logger;
  private communicationMethod: 'uxp' | 'extendscript' | 'file';
  private tempDir: string;
  private uxpProcess?: ChildProcess;
  private isInitialized = false;

  constructor() {
    this.logger = new Logger('PremiereProBridge');
    this.communicationMethod = 'file'; // Default to file-based communication
    // Use a fixed location so the CEP panel can watch the same folder
    this.tempDir = '/tmp/premiere-bridge';
  }

  async initialize(): Promise<void> {
    try {
      await this.setupTempDirectory();
      await this.detectPremiereProInstallation();
      await this.initializeCommunication();
      this.isInitialized = true;
      this.logger.info('Adobe Premiere Pro bridge initialized successfully');
    } catch (error) {
      const message = getErrorMessage(error);
      this.logger.error('Failed to initialize Adobe Premiere Pro bridge:', error);
      if (error instanceof BridgeInitializationError || error instanceof PremiereNotFoundError) {
        throw error;
      }
      throw new BridgeInitializationError(message, error instanceof Error ? error : undefined);
    }
  }

  private async setupTempDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
      this.logger.debug(`Temp directory created: ${this.tempDir}`);
    } catch (error) {
      const message = getErrorMessage(error);
      this.logger.error('Failed to create temp directory:', error);
      throw new BridgeInitializationError(`Failed to create temp directory: ${message}`, error instanceof Error ? error : undefined);
    }
  }

  private async detectPremiereProInstallation(): Promise<void> {
    // Check for common Premiere Pro installation paths
    const commonPaths = [
      '/Applications/Adobe Premiere Pro 2025/Adobe Premiere Pro 2025.app',
      '/Applications/Adobe Premiere Pro 2024/Adobe Premiere Pro 2024.app',
      '/Applications/Adobe Premiere Pro 2023/Adobe Premiere Pro 2023.app',
      'C:\\Program Files\\Adobe\\Adobe Premiere Pro 2025\\Adobe Premiere Pro.exe',
      'C:\\Program Files\\Adobe\\Adobe Premiere Pro 2024\\Adobe Premiere Pro.exe',
      'C:\\Program Files\\Adobe\\Adobe Premiere Pro 2023\\Adobe Premiere Pro.exe'
    ];

    const checkedPaths: string[] = [];
    for (const path of commonPaths) {
      try {
        await fs.access(path);
        this.logger.info(`Found Adobe Premiere Pro at: ${path}`);
        return;
      } catch (error) {
        // Log at debug level and continue checking other paths
        this.logger.debug(`Premiere Pro not found at: ${path}`);
        checkedPaths.push(path);
      }
    }

    // Log warning with all checked paths for debugging
    this.logger.warn(`Adobe Premiere Pro installation not found. Checked paths: ${checkedPaths.join(', ')}`);
    // Note: We don't throw here because the bridge can still work with file-based communication
    // if Premiere Pro is running and the CEP extension is loaded
  }

  private async initializeCommunication(): Promise<void> {
    // For now, we'll use file-based communication as it's the most reliable
    // In a production environment, you would set up UXP or ExtendScript communication
    this.communicationMethod = 'file';
    this.logger.info(`Using ${this.communicationMethod} communication method`);
  }

  async executeScript(script: string, timeoutMs: number = DEFAULT_RESPONSE_TIMEOUT_MS): Promise<any> {
    if (!this.isInitialized) {
      throw new BridgeNotInitializedError('executeScript');
    }

    const commandId = uuidv4();
    const commandFile = join(this.tempDir, `command-${commandId}.json`);
    const responseFile = join(this.tempDir, `response-${commandId}.json`);

    try {
      // Write command to file
      await fs.writeFile(commandFile, JSON.stringify({
        id: commandId,
        script,
        timestamp: new Date().toISOString()
      }));

      // Wait for response (in a real implementation, this would be handled by the UXP plugin)
      const response = await this.waitForResponse(responseFile, timeoutMs, commandId);

      // Clean up files with error logging
      await this.cleanupCommandFiles(commandFile, responseFile, commandId);

      return response;
    } catch (error) {
      // Attempt cleanup even on error
      await this.cleanupCommandFiles(commandFile, responseFile, commandId);

      if (error instanceof ResponseTimeoutError || error instanceof ResponseParseError) {
        throw error;
      }

      const message = getErrorMessage(error);
      this.logger.error(`Failed to execute script (command ${commandId}): ${message}`);
      throw new ScriptExecutionError(
        `Failed to execute script: ${message}`,
        { commandId },
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Clean up command and response files after script execution
   */
  private async cleanupCommandFiles(commandFile: string, responseFile: string, commandId: string): Promise<void> {
    const cleanupErrors: string[] = [];

    try {
      await fs.unlink(commandFile);
    } catch (error) {
      // Only log if file exists but couldn't be deleted (ENOENT is expected if already cleaned)
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        cleanupErrors.push(`command file: ${getErrorMessage(error)}`);
      }
    }

    try {
      await fs.unlink(responseFile);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        cleanupErrors.push(`response file: ${getErrorMessage(error)}`);
      }
    }

    if (cleanupErrors.length > 0) {
      this.logger.warn(`Failed to clean up files for command ${commandId}: ${cleanupErrors.join(', ')}`);
    }
  }

  private async waitForResponse(responseFile: string, timeout: number = DEFAULT_RESPONSE_TIMEOUT_MS, commandId?: string): Promise<any> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const responseContent = await fs.readFile(responseFile, 'utf8');

        // Separate JSON parse to distinguish parse errors from file read errors
        try {
          return JSON.parse(responseContent);
        } catch (parseError) {
          // File exists but contains invalid JSON - this is a real error
          throw new ResponseParseError(
            `Invalid JSON in response file${commandId ? ` for command ${commandId}` : ''}: ${getErrorMessage(parseError)}`,
            parseError instanceof Error ? parseError : undefined
          );
        }
      } catch (error) {
        // Re-throw parse errors immediately
        if (error instanceof ResponseParseError) {
          throw error;
        }

        // For file not found (ENOENT), wait and retry
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          await new Promise(resolve => setTimeout(resolve, RESPONSE_POLL_INTERVAL_MS));
          continue;
        }

        // For other file system errors, throw immediately
        throw new ScriptExecutionError(
          `Failed to read response file: ${getErrorMessage(error)}`,
          { commandId, responseFile },
          error instanceof Error ? error : undefined
        );
      }
    }

    throw new ResponseTimeoutError(timeout, commandId ? `command ${commandId}` : undefined);
  }

  // Project Management
  async createProject(name: string, location: string): Promise<PremiereProProject> {
    const script = `
      // Create new project
      app.newProject("${name}", "${location}");
      var project = app.project;
      
      // Return project info
      JSON.stringify({
        id: project.documentID,
        name: project.name,
        path: project.path,
        isOpen: true,
        sequences: [],
        projectItems: []
      });
    `;
    
    return await this.executeScript(script);
  }

  async openProject(path: string): Promise<PremiereProProject> {
    const script = `
      // Open existing project
      app.openDocument("${path}");
      var project = app.project;
      
      // Return project info
      JSON.stringify({
        id: project.documentID,
        name: project.name,
        path: project.path,
        isOpen: true,
        sequences: [],
        projectItems: []
      });
    `;
    
    return await this.executeScript(script);
  }

  async saveProject(): Promise<void> {
    const script = `
      // Save current project
      app.project.save();
      JSON.stringify({ success: true });
    `;
    
    await this.executeScript(script);
  }

  async importMedia(filePath: string): Promise<PremiereProProjectItem> {
    const script = `
      // Import media file
      var file = new File("${filePath}");
      var importedItem = app.project.importFiles([file.fsName]);
      
      // Return imported item info
      JSON.stringify({
        id: importedItem.nodeId,
        name: importedItem.name,
        type: importedItem.type,
        mediaPath: importedItem.getMediaPath(),
        duration: importedItem.getOutPoint() - importedItem.getInPoint(),
        frameRate: importedItem.getVideoFrameRate()
      });
    `;
    
    return await this.executeScript(script);
  }

  async createSequence(name: string, presetPath?: string): Promise<PremiereProSequence> {
    const script = `
      // Create new sequence
      var sequence = app.project.createNewSequence("${name}", "${presetPath || ''}");
      
      // Return sequence info
      JSON.stringify({
        id: sequence.sequenceID,
        name: sequence.name,
        duration: sequence.end - sequence.zeroPoint,
        frameRate: sequence.framerate,
        videoTracks: [],
        audioTracks: []
      });
    `;
    
    return await this.executeScript(script);
  }

  async addToTimeline(sequenceId: string, projectItemId: string, trackIndex: number, time: number): Promise<PremiereProClip> {
    const script = `
      // Add item to timeline
      var sequence = app.project.getSequenceByID("${sequenceId}");
      var projectItem = app.project.getProjectItemByID("${projectItemId}");
      var track = sequence.videoTracks[${trackIndex}];
      
      var clip = track.insertClip(projectItem, ${time});
      
      // Return clip info
      JSON.stringify({
        id: clip.clipID,
        name: clip.name,
        inPoint: clip.start,
        outPoint: clip.end,
        duration: clip.duration,
        mediaPath: clip.projectItem.getMediaPath()
      });
    `;
    
    return await this.executeScript(script);
  }

  async renderSequence(sequenceId: string, outputPath: string, presetPath: string): Promise<void> {
    const script = `
      // Render sequence
      var sequence = app.project.getSequenceByID("${sequenceId}");
      var encoder = app.encoder;
      
      encoder.encodeSequence(sequence, "${outputPath}", "${presetPath}", 
        encoder.ENCODE_ENTIRE, false);
      
      JSON.stringify({ success: true });
    `;
    
    await this.executeScript(script);
  }

  async listProjectItems(): Promise<PremiereProProjectItem[]> {
    const script = `
      try {
        if (!app.project || !app.project.rootItem) {
          throw new Error('No open project');
        }
        function walk(item) {
          var results = [];
          if (item.type === ProjectItemType.BIN) {
            for (var i = 0; i < item.children.numItems; i++) {
              results = results.concat(walk(item.children[i]));
            }
          } else {
            results.push({
              id: item.nodeId || item.treePath || item.name,
              name: item.name,
              type: item.type === ProjectItemType.BIN ? 'bin' : (item.type === ProjectItemType.SEQUENCE ? 'sequence' : 'footage'),
              mediaPath: item.getMediaPath ? item.getMediaPath() : undefined,
              duration: item.getOutPoint ? (item.getOutPoint() - item.getInPoint()) : undefined,
              frameRate: item.getVideoFrameRate ? item.getVideoFrameRate() : undefined
            });
          }
          return results;
        }
        var items = walk(app.project.rootItem);
        JSON.stringify({ ok: true, items });
      } catch (e) {
        JSON.stringify({ ok: false, error: String(e) });
      }
    `;
    const result = await this.executeScript(script);
    if (result.ok) return result.items;
    throw new Error(result.error || 'Unknown error listing project items');
  }

  async cleanup(): Promise<void> {
    if (this.uxpProcess) {
      this.uxpProcess.kill();
    }
    
    // Clean up temp directory
    try {
      await fs.rm(this.tempDir, { recursive: true });
    } catch (error) {
      this.logger.warn('Failed to clean up temp directory:', error);
    }
    
    this.logger.info('Adobe Premiere Pro bridge cleaned up');
  }
} 