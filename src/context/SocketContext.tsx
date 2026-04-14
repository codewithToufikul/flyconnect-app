import React, { createContext, useContext, useEffect, useState } from "react";
import SocketService from "../services/SocketService";
import { useProfile } from "./ProfileContext";
import { useToast } from "./ToastContext";
import { AppState } from "react-native";

interface SocketContextType {
    isConnected: boolean;
    socket: any;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isConnected, setIsConnected] = useState(false);
    const [socket, setSocket] = useState<any>(null);
    const { user } = useProfile();
    const { showToast } = useToast();

    useEffect(() => {
        const initSocket = async () => {
            if (user) {
                await SocketService.connect();
                const socketInstance = SocketService.getSocket();

                if (socketInstance) {
                    setSocket(socketInstance);
                    setIsConnected(socketInstance.connected);

                    const onConnect = () => {
                        console.log("🟢 Socket connected (Provider State)");
                        setIsConnected(true);
                    };
                    const onDisconnect = () => {
                        console.log("🔴 Socket disconnected (Provider State)");
                        setIsConnected(false);
                    };
                    const onReceiveMessage = (msg: any) => {
                        const currentUserId = (user as any)?._id || (user as any)?.id;
                        const senderId = msg.senderId?._id || msg.senderId?.id || msg.senderId;

                        // Don't show toast for own messages
                        if (senderId && senderId.toString() === currentUserId?.toString()) return;

                        // Only show if app is in foreground
                        if (AppState.currentState !== 'active') return;

                        showToast({
                            senderId: msg.senderId?._id || msg.senderId?.id || (typeof msg.senderId === 'string' ? msg.senderId : ''),
                            senderName: msg.senderId?.name || 'New Message',
                            senderImage: msg.senderId?.profileImage,
                            message: msg.content || '',
                            conversationId: msg.conversationId?._id || msg.conversationId || '',
                            contentType: msg.contentType,
                        });
                    };

                    socketInstance.on("connect", onConnect);
                    socketInstance.on("disconnect", onDisconnect);
                    socketInstance.on("receive_message", onReceiveMessage);

                    return () => {
                        socketInstance.off("connect", onConnect);
                        socketInstance.off("disconnect", onDisconnect);
                        socketInstance.off("receive_message", onReceiveMessage);
                    };
                }
            } else {
                console.log("🚪 User logged out, disconnecting socket");
                SocketService.disconnect();
                setSocket(null);
                setIsConnected(false);
            }
        };

        const cleanup = initSocket();

        return () => {
            cleanup.then(unsub => unsub && unsub());
        };
    }, [user, showToast]);

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
