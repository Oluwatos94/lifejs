"use client";

import { cn } from "@/lib/cn";
import logoIcon from "@/public/logo-full.png";
import { RiDiscordFill } from "@remixicon/react";
import { motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import type { FC, HTMLAttributes } from "react";

interface WebsiteHeaderProps extends HTMLAttributes<HTMLDivElement> {
  animate: boolean;
  showLogo: boolean;
}

export const WebsiteHeader: FC<WebsiteHeaderProps> = ({
  className,
  animate,
  showLogo,
  ...props
}) => {
  return (
    <nav className={cn("h-20", className)} {...props}>
      <motion.div
        className={cn(
          "absolute top-[1.125rem] left-[1.125rem] z-10 flex h-[37px] transform items-center justify-center pl-2",
          !showLogo && "hidden",
        )}
        initial={
          animate
            ? {
                y: -100,
                opacity: 0,
                filter: "blur(10px)",
              }
            : false
        }
        animate={{
          y: 0,
          opacity: 1,
          filter: "blur(0px)",
        }}
        transition={{
          duration: 0.8,
          ease: [0.21, 1.02, 0.73, 1],
          delay: 1.2,
        }}
      >
        <Link href="/">
          <Image
            src={logoIcon}
            alt="Life.js"
            height={100}
            className="h-[20px] w-auto opacity-30 grayscale-100 transition-opacity hover:opacity-60"
          />
        </Link>
      </motion.div>
      <motion.div
        className="-translate-x-1/2 absolute top-[1.125rem] left-1/2 z-10 transform"
        initial={
          animate
            ? {
                y: -100,
                opacity: 0,
                filter: "blur(10px)",
              }
            : false
        }
        animate={{
          y: 0,
          opacity: 1,
          filter: "blur(0px)",
        }}
        transition={{
          duration: 0.8,
          ease: [0.21, 1.02, 0.73, 1],
          delay: 1.2,
        }}
      >
        <div className="flex h-[36px] items-center gap-[1.6875rem] rounded-full border border-black/6 bg-black/2 px-[1.15rem] font-normal text-[0.93275rem] text-black/40 transition-colors hover:border-black/10">
          <Link
            href="/docs/start-here/overview"
            className="leading-none leading-trim tracking-normal transition-colors hover:text-black/60"
          >
            Docs
          </Link>
          <Link
            href="/examples"
            className="leading-none leading-trim tracking-normal transition-colors hover:text-black/60"
          >
            Examples
          </Link>
          {/* <Link
              href="/news"
              className="leading-none leading-trim tracking-normal transition-colors hover:text-black/60"
            >
              News
            </Link> */}
          <Link
            href="/changelog"
            className="leading-none leading-trim tracking-normal transition-colors hover:text-black/60"
          >
            Changelog
          </Link>
        </div>
      </motion.div>
      <motion.div
        className="absolute top-[1.125rem] right-[1.125rem] z-10 flex h-[37px] transform items-center justify-center pr-2"
        initial={
          animate
            ? {
                y: -100,
                opacity: 0,
                filter: "blur(10px)",
              }
            : false
        }
        animate={{
          y: 0,
          opacity: 1,
          filter: "blur(0px)",
        }}
        transition={{
          duration: 0.8,
          ease: [0.21, 1.02, 0.73, 1],
          delay: 1.2,
        }}
      >
        <Link href="https://discord.gg/U5wHjT5Ryj" target="_blank">
          <RiDiscordFill className="size-6.5 text-black/20 transition-colors hover:text-black/40" />
        </Link>
      </motion.div>
    </nav>
  );
};
