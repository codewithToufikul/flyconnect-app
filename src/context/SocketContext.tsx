import React, { createContext, useContext, useEffect, useState } from "react";
import SocketService from "../services/SocketService";
import { useProfile } from "./ProfileContext";

interface SocketContextType {
    isConnected: boolean;
    socket: any;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isConnected, setIsConnected] = useState(false);
    const [socket, setSocket] = useState<any>(null);
    const { user } = useProfile();

    useEffect(() => {
        const initSocket = async () => {
            if (user) {
                // SocketService.connect() is async because it fetches the token
                await SocketService.connect();
                const socketInstance = SocketService.getSocket();

                if (socketInstance) {
                    setSocket(socketInstance);
                    setIsConnected(socketInstance.connected);

                    socketInstance.on("connect", () => {
                        console.log("🟢 Socket connected (Provider State)");
                        setIsConnected(true);
                    });
                    socketInstance.on("disconnect", () => {
                        console.log("🔴 Socket disconnected (Provider State)");
                        setIsConnected(false);
                    });
                }
            } else {
                console.log("🚪 User logged out, disconnecting socket");
                SocketService.disconnect();
                setSocket(null);
                setIsConnected(false);
            }
        };

        initSocket();

        return () => {
            const currentSocket = SocketService.getSocket();
            if (currentSocket) {
                currentSocket.off("connect");
                currentSocket.off("disconnect");
            }
        };
    }, [user]);

    return (
        <SocketContext.Provider value={{ isConnected, socket }}>
            {children}
        </SocketContext.Provider>
    );
};

export const useSocket = () => {
    const context = useContext(SocketContext);
    if (context === undefined) {
        throw new Error("useSocket must be used within a SocketProvider");
    }
    return context;
};
