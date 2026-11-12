"use client";

import { useSyncExternalStore } from "react";
import { currentLang, subscribeLang, type Lang } from "./locale";
import { MESSAGES } from "./messages";

/** The interface language; the server always renders English, the browser then applies the saved choice. */
export const useLang = (): Lang => useSyncExternalStore(subscribeLang, currentLang, () => "en");

/** The messages for the current language. Every component that shows case text calls this, so a switch re-renders it. */
export const useT = () => MESSAGES[useLang()];
