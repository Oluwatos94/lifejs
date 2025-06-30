"use client";

import { cn } from "@/lib/cn";
import logoIcon from "@/public/logo-full.png";
import { RiDiscordFill, RiGithubFill } from "@remixicon/react";
import { motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { FC, HTMLAttributes } from "react";

interface WebsiteHeaderProps extends HTMLAttributes<HTMLDivElement> {}

export const WebsiteHeader: FC<WebsiteHeaderProps> = ({
  className,

  ...props
}) => {
  const pathname = usePathname();
  const isHomePage = pathname === "/";
  const animateDelay = isHomePage ? 1.2 : 0;
  console.log(pathname);

  return (
    <nav className={cn("h-20", className)} {...props}>
      {!isHomePage && (
        <motion.div
          className={cn(
            "absolute top-[1.125rem] left-[1.125rem] z-10 flex h-[37px] transform items-center justify-center pl-2",
          )}
          initial={{
            opacity: 0,
            filter: "blur(10px)",
          }}
          animate={{
            opacity: 1,
            filter: "blur(0px)",
          }}
          transition={{
            duration: 0.8,
            ease: [0.21, 1.02, 0.73, 1],
            delay: animateDelay,
          }}
        >
          <Link href="/">
            <Image
              src={logoIcon}
              alt="Life.js"
              height={100}
              className="h-[20px] w-auto opacity-30 grayscale-100 transition-all duration-500 hover:opacity-60 hover:grayscale-0"
            />
          </Link>
        </motion.div>
      )}
      {isHomePage && (
        <motion.div
          className={cn(
            "absolute top-[1.125rem] left-[1.125rem] z-10 flex h-[37px] transform items-center justify-center pl-2",
          )}
          initial={{
            opacity: 0,
            filter: "blur(10px)",
          }}
          animate={{
            opacity: 1,
            filter: "blur(0px)",
          }}
          transition={{
            duration: 0.8,
            ease: [0.21, 1.02, 0.73, 1],
            delay: animateDelay,
          }}
        >
          <div className="pointer-events-none flex items-center gap-2">
            <p className="font-code text-black/15 text-xs">BRING LIFE TO YOUR APP</p>
            <div className="h-px w-[50px] bg-black/5"></div>
          </div>
        </motion.div>
      )}
      <motion.div
        className="-translate-x-1/2 absolute top-[1.125rem] left-1/2 z-10 transform"
        initial={{
          opacity: 0,
          filter: "blur(10px)",
        }}
        animate={{
          opacity: 1,
          filter: "blur(0px)",
        }}
        transition={{
          duration: 0.8,
          ease: [0.21, 1.02, 0.73, 1],
          delay: animateDelay,
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
        className="absolute top-[1.125rem] right-[1.125rem] z-10 flex h-[37px] transform items-center justify-center gap-3 pr-2"
        initial={{
          opacity: 0,
          filter: "blur(10px)",
        }}
        animate={{
          opacity: 1,
          filter: "blur(0px)",
        }}
        transition={{
          duration: 0.8,
          ease: [0.21, 1.02, 0.73, 1],
          delay: animateDelay,
        }}
      >
        <Link href="https://github.com/lifejs/lifejs" target="_blank">
          <RiGithubFill className="size-6.5 text-black/20 transition-colors duration-300 hover:text-black/40" />
        </Link>
        <Link href="https://discord.gg/U5wHjT5Ryj" target="_blank">
          <RiDiscordFill className="size-6.5 text-black/20 transition-colors duration-300 hover:text-black/40" />
        </Link>
      </motion.div>
    </nav>
  );
};
