"use client";

import React, { useState, useRef, useEffect } from "react";
import * as pdfjs from "pdfjs-dist";
import { chatWithLangbase } from "@/utils/langbase";
import * as diff from "diff";

// Configure PDF.js worker for client-side only
const pdfjsWorker = () => {
  if (typeof window === "undefined") {
    return null;
  }

  pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
};

export default function ResumeUploader() {
  const [pdfFile, setPdfFile] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [extractedText, setExtractedText] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [optimizedResume, setOptimizedResume] = useState<string | null>(null);
  const [diffResult, setDiffResult] = useState<Array<{ added?: boolean; removed?: boolean; value: string }>>([]);
  const [viewMode, setViewMode] = useState<"original" | "optimized" | "diff">("original");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const descriptionInputRef = useRef<HTMLInputElement>(null);

  // Initialize PDF.js worker on client-side
  useEffect(() => {
    pdfjsWorker();
  }, []);

  // Generate diff when optimized resume is available
  useEffect(() => {
    if (extractedText && optimizedResume) {
      const differences = diff.diffWords(extractedText, optimizedResume);
      setDiffResult(differences);
    }
  }, [extractedText, optimizedResume]);

  // This function extracts text from PDF data
  const extractTextFromPDFData = async (pdfData: string): Promise<string> => {
    try {
      // Remove the data URL prefix to get the base64 string
      const base64Data = pdfData.replace(/^data:application\/pdf;base64,/, "");

      // Convert base64 to binary
      const binaryData = atob(base64Data);

      // Create a typed array from the binary string
      const length = binaryData.length;
      const array = new Uint8Array(length);
      for (let i = 0; i < length; i++) {
        array[i] = binaryData.charCodeAt(i);
      }

      // Load the PDF document
      const loadingTask = pdfjs.getDocument({ data: array });
      const pdf = await loadingTask.promise;

      // Extract text from each page
      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();

        // Extract text from each item
        const pageText = textContent.items
          .filter((item) => "str" in item)
          .map((item) => (item as { str: string }).str)
          .join(" ");

        fullText += `${pageText}\n\n`;
      }

      return fullText.trim();
    } catch (error) {
      console.error("Error details:", error);
      throw new Error("Failed to extract text from PDF");
    }
  };

  const processFile = async (file: File) => {
    if (file && file.type === "application/pdf") {
      setFileName(file.name);
      setIsLoading(true);

      const fileReader = new FileReader();
      fileReader.onload = async (event) => {
        const pdfData = event.target?.result as string;
        setPdfFile(pdfData);

        try {
          const text = await extractTextFromPDFData(pdfData);
          setExtractedText(text);
          console.log("Extracted text from PDF:", text);
        } catch (error) {
          console.error("Error extracting text from PDF:", error);
        } finally {
          setIsLoading(false);
        }
      };
      fileReader.readAsDataURL(file);
    } else {
      alert("Please select a PDF file");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.classList.add("border-blue-500");
    e.currentTarget.classList.add("bg-blue-50");
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.classList.remove("border-blue-500");
    e.currentTarget.classList.remove("bg-blue-50");
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.classList.remove("border-blue-500");
    e.currentTarget.classList.remove("bg-blue-50");

    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const resetUpload = () => {
    setPdfFile(null);
    setFileName("");
    setExtractedText("");
    setOptimizedResume(null);
    setDiffResult([]);
    setViewMode("original");
  };

  const handleSubmit = async () => {
    const jobDescription = descriptionInputRef.current?.value || "";
    
    if (!extractedText) {
      alert("Please upload a resume first");
      return;
    }
    
    if (!jobDescription.trim()) {
      alert("Please enter a job description");
      return;
    }

    setIsSubmitting(true);
    try {
      // Send both the resume text and job description to the langbase function
      const optimizedText = await chatWithLangbase(extractedText, jobDescription);
      setOptimizedResume(optimizedText);
      setViewMode("optimized");
      console.log("Data sent to langbase successfully");
    } catch (error) {
      console.error("Error sending data to langbase:", error);
      alert("Error processing your request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyToClipboard = () => {
    if (optimizedResume) {
      navigator.clipboard.writeText(optimizedResume)
        .then(() => {
          alert("Optimized resume copied to clipboard!");
        })
        .catch(err => {
          console.error("Failed to copy: ", err);
          alert("Failed to copy resume to clipboard");
        });
    }
  };

  // Function to create a downloadable text file
  const handleDownloadAsText = () => {
    if (!optimizedResume) return;
    
    try {
      // Create a blob from the text
      const blob = new Blob([optimizedResume], { type: 'text/plain' });
      
      // Create an object URL for the blob
      const url = URL.createObjectURL(blob);
      
      // Create a download link
      const a = document.createElement('a');
      a.href = url;
      a.download = `optimized-${fileName.replace('.pdf', '') || 'resume'}.txt`;
      
      // Append to the document, click it, and remove it
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // Release the object URL
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error creating text file:", error);
      alert("Failed to download as text file");
    }
  };

  const renderDiffView = () => {
    return (
      <div className="whitespace-pre-wrap font-mono text-sm text-black">
        {diffResult.map((part, index) => {
          // Display added text in green with yellow highlight
          if (part.added) {
            return (
              <span key={index} className="bg-yellow-200 text-green-700 font-bold">
                {part.value}
              </span>
            );
          }
          // Display removed text in red with strikethrough
          if (part.removed) {
            return (
              <span key={index} className="text-red-500 line-through">
                {part.value}
              </span>
            );
          }
          // Display unchanged text normally
          return <span key={index} className="text-black">{part.value}</span>;
        })}
      </div>
    );
  };

  // Function to format resume text with proper line breaks for display
  const formatResumeForDisplay = (text: string) => {
    return text.split('\n').map((line, index) => (
      <React.Fragment key={index}>
        {line}
        <br />
      </React.Fragment>
    ));
  };

  const renderContentView = () => {
    if (viewMode === "original") {
      return (
        <div className="w-full h-96">
          <iframe
            src={pdfFile || ""}
            className="w-full h-full"
            title="Resume Preview"
          />
        </div>
      );
    } else if (viewMode === "optimized" && optimizedResume) {
      return (
        <div className="p-6 w-full h-96 overflow-auto bg-white">
          <div className="whitespace-pre-wrap font-mono text-sm text-black">
            {formatResumeForDisplay(optimizedResume)}
          </div>
        </div>
      );
    } else if (viewMode === "diff" && diffResult.length > 0) {
      return (
        <div className="p-6 w-full h-96 overflow-auto bg-white">
          {renderDiffView()}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col items-center min-h-screen w-full bg-gray-50 p-4">
      {(isLoading || isSubmitting) && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded-lg shadow-xl flex items-center space-x-3">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-black">{isLoading ? "Processing resume..." : "Optimizing resume for job description..."}</p>
          </div>
        </div>
      )}

      {!pdfFile ? (
        <div
          className="w-full max-w-2xl mx-auto mt-10 bg-white rounded-lg shadow-md p-6 border-2 border-dashed border-blue-300 transition-all cursor-pointer hover:border-blue-500"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleUploadClick}
        >
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileChange}
          />
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="p-3 bg-blue-50 rounded-full">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-blue-500"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-800">
              Upload Your Resume
            </h3>
            <p className="text-sm text-gray-500 text-center">
              Drag and drop your PDF resume here, or click to select a file
            </p>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium">
              Select PDF
            </button>
            <p className="text-xs text-gray-400">PDF files only</p>
          </div>
        </div>
      ) : (
        <div className="w-full max-w-3xl mt-6">
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            {/* Header with filename and view toggles */}
            <div className="p-4 border-b flex flex-wrap justify-between items-center bg-gray-50">
              <h2 className="font-medium text-gray-700 truncate mb-2 md:mb-0">{fileName}</h2>
              <div className="flex space-x-2">
                {optimizedResume && (
                  <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
                    <button
                      onClick={() => setViewMode("original")}
                      className={`text-xs px-3 py-1 rounded transition-colors ${
                        viewMode === "original" 
                          ? "bg-blue-500 text-white" 
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      Original
                    </button>
                    <button
                      onClick={() => setViewMode("optimized")}
                      className={`text-xs px-3 py-1 rounded transition-colors ${
                        viewMode === "optimized" 
                          ? "bg-blue-500 text-white" 
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      Optimized
                    </button>
                    <button
                      onClick={() => setViewMode("diff")}
                      className={`text-xs px-3 py-1 rounded transition-colors ${
                        viewMode === "diff" 
                          ? "bg-blue-500 text-white" 
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      Changes
                    </button>
                  </div>
                )}
                <button
                  onClick={handleUploadClick}
                  className="text-xs px-3 py-1 bg-blue-100 text-blue-600 rounded hover:bg-blue-200 transition-colors"
                >
                  Upload New
                </button>
                <button
                  onClick={resetUpload}
                  className="text-xs px-3 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200 transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>

            {/* Content area - PDF/Optimized/Diff view */}
            {renderContentView()}

            {/* Action buttons for optimized resume */}
            {optimizedResume && viewMode !== "original" && (
              <div className="p-4 border-t bg-gray-50 flex justify-end space-x-3">
                <button
                  onClick={handleCopyToClipboard}
                  className="px-3 py-2 bg-blue-100 text-blue-600 rounded hover:bg-blue-200 transition-colors flex items-center"
                >
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    className="h-4 w-4 mr-1" 
                    viewBox="0 0 24 24" 
                    fill="none"
                    stroke="currentColor" 
                    strokeWidth="2" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                  Copy to Clipboard
                </button>
                <button
                  onClick={handleDownloadAsText}
                  className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors flex items-center"
                >
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    className="h-4 w-4 mr-1" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                  Download as Text
                </button>
              </div>
            )}
          </div>
          
          {/* Job description input and submit button */}
          <div className="flex flex-col md:flex-row justify-center items-center gap-4 mt-12 px-4">
            <input
              type="text"
              placeholder="Enter job description"
              className="text-black p-4 border border-gray-300 rounded-md w-full md:w-96"
              ref={descriptionInputRef}
            />
            <button
              className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-4 px-6 rounded-md transition-colors duration-200 disabled:bg-blue-300"
              onClick={handleSubmit}
              disabled={isSubmitting || !pdfFile}
            >
              {isSubmitting ? "Processing..." : "Optimize Resume"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}